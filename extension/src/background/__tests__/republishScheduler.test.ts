import { beforeEach, describe, expect, it, vi } from "vitest";

// Mission "ROUND 3 -- CHROME.ALARMS UNIQUEMENT, REVEIL/LOG SANS EXECUTION
// VINTED" (2026-08-20) : meme discipline de mock que sync.test.ts (session/
// supabaseClient/logger mockes, le VRAI module teste). chrome.alarms/
// chrome.runtime simules par un fake minimal en memoire -- suffisant pour
// prouver create/clear/getAll et le declenchement des listeners, jamais un
// emulateur Chrome complet.
vi.mock("../session", () => ({ getValidAccessToken: vi.fn() }));
vi.mock("../supabaseClient", () => ({ supabaseWithToken: vi.fn() }));
vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
// Mission "ROUND 4" : ce fichier ne teste que la DETECTION (alarmes/sweep/
// startup) -- l'execution reelle (claim/payload/runAction/finalisation) est
// testee separement dans scheduledRepublishExecutor.test.ts. Mocke ici pour
// eviter qu'un test de detection ne declenche par accident une vraie tentative
// de claim/execution (chaine Supabase non prevue pour ca dans ce fichier).
vi.mock("../scheduledRepublishExecutor", () => ({ executeClaimedSchedule: vi.fn() }));

import { getValidAccessToken } from "../session";
import { supabaseWithToken } from "../supabaseClient";
import { logger } from "../logger";
import { executeClaimedSchedule } from "../scheduledRepublishExecutor";
import {
  REPUBLISH_SWEEP_ALARM_NAME,
  alarmNameForSchedule,
  handleAlarmFired,
  handleExtensionStartup,
  initRepublishScheduler,
  resyncAlarms,
} from "../republishScheduler";

interface Row {
  id: string;
  listing_id: string;
  vinted_account_id: string;
  scheduled_for: string;
  status: string;
}

// Chaine Supabase mockee minimale (Proxy) -- meme discipline que
// src/services/__tests__/republishSchedules.test.ts cote app : trace chaque
// appel de methode, resout au terminal (.then / .maybeSingle()).
function makeChain(result: { data: unknown; error: unknown }) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const chain: Record<string, unknown> = {};
  const self = new Proxy(chain, {
    get(_t, prop: string) {
      if (prop === "then") return (resolve: (v: typeof result) => void) => resolve(result);
      if (prop === "maybeSingle" || prop === "single") return () => Promise.resolve(result);
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        return self;
      };
    },
  });
  return { chain: self, calls };
}

// Fake chrome.alarms/chrome.runtime en memoire -- assez pour prouver
// create/clear/getAll et capturer les listeners enregistres par
// initRepublishScheduler(), sans emuler tout Chrome.
function makeChromeMock() {
  const alarmsStore = new Map<string, chrome.alarms.Alarm>();
  let alarmListener: ((alarm: chrome.alarms.Alarm) => void) | null = null;
  let startupListener: (() => void) | null = null;

  const create = vi.fn((name: string, info: { when?: number; delayInMinutes?: number; periodInMinutes?: number }) => {
    const scheduledTime = info.when ?? Date.now() + (info.delayInMinutes ?? 0) * 60000;
    alarmsStore.set(name, { name, scheduledTime, periodInMinutes: info.periodInMinutes } as chrome.alarms.Alarm);
  });
  const clear = vi.fn((name: string) => {
    const existed = alarmsStore.delete(name);
    return Promise.resolve(existed);
  });
  const getAll = vi.fn(() => Promise.resolve(Array.from(alarmsStore.values())));

  const chromeMock = {
    alarms: {
      create,
      clear,
      getAll,
      onAlarm: {
        addListener: vi.fn((fn: (alarm: chrome.alarms.Alarm) => void) => {
          alarmListener = fn;
        }),
      },
    },
    runtime: {
      onStartup: {
        addListener: vi.fn((fn: () => void) => {
          startupListener = fn;
        }),
      },
    },
  };

  return {
    chromeMock,
    alarmsStore,
    create,
    clear,
    getAll,
    // Appelle directement handleAlarmFired() exporte (jamais via le listener
    // capture ici) -- evite toute course avec la resynchronisation
    // fire-and-forget que initRepublishScheduler() declenche en parallele
    // (voir son en-tete). Prend la valeur reellement stockee si presente
    // (meme scheduledTime que create() a pose), sinon une valeur par defaut
    // pour une alarme "inconnue".
    fireAlarm: async (name: string) => {
      const stored = alarmsStore.get(name) ?? ({ name, scheduledTime: Date.now() } as chrome.alarms.Alarm);
      await handleAlarmFired(stored);
    },
    // Conserve pour la seule assertion "les listeners sont bien enregistres"
    // (describe initRepublishScheduler ci-dessous) -- jamais utilise pour
    // declencher une alarme dans les autres tests.
    getRegisteredListeners: () => ({ alarmListener, startupListener }),
  };
}

const NOW = new Date("2026-08-20T15:00:00.000Z").getTime();

function futureJob(overrides: Partial<Row> = {}): Row {
  return {
    id: "sched-1",
    listing_id: "listing-1",
    vinted_account_id: "acc-1",
    scheduled_for: new Date(NOW + 60 * 60 * 1000).toISOString(), // +1h
    status: "scheduled",
    ...overrides,
  };
}

function dueJob(overrides: Partial<Row> = {}): Row {
  return {
    id: "sched-2",
    listing_id: "listing-2",
    vinted_account_id: "acc-2",
    scheduled_for: new Date(NOW - 5 * 60 * 1000).toISOString(), // -5min (deja du)
    status: "scheduled",
    ...overrides,
  };
}

let chromeHelpers: ReturnType<typeof makeChromeMock>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  chromeHelpers = makeChromeMock();
  vi.stubGlobal("chrome", chromeHelpers.chromeMock);
});

function mockSession(): void {
  vi.mocked(getValidAccessToken).mockResolvedValue({ accessToken: "token-abc", userId: "u1" });
}

function mockNoSession(): void {
  vi.mocked(getValidAccessToken).mockResolvedValue(null);
}

function mockScheduledList(rows: Row[]): void {
  const { chain } = makeChain({ data: rows, error: null });
  vi.mocked(supabaseWithToken).mockReturnValue(chain as unknown as ReturnType<typeof supabaseWithToken>);
}

function mockSingleJob(row: Row | null): void {
  const { chain } = makeChain({ data: row, error: null });
  vi.mocked(supabaseWithToken).mockReturnValue(chain as unknown as ReturnType<typeof supabaseWithToken>);
}

describe("resyncAlarms", () => {
  it("job futur -> alarme creee a la bonne date (when = scheduled_for exact)", async () => {
    mockSession();
    const job = futureJob();
    mockScheduledList([job]);

    await resyncAlarms();

    expect(chromeHelpers.create).toHaveBeenCalledWith(alarmNameForSchedule(job.id), { when: new Date(job.scheduled_for).getTime() });
  });

  it("job annule (plus dans la liste scheduled) -> l'alarme existante est supprimee", async () => {
    // Alarme deja presente pour un job qui n'apparait plus dans le resultat
    // Supabase (annule/termine) -- simule l'etat "avant" resync.
    chromeHelpers.alarmsStore.set(alarmNameForSchedule("sched-cancelled"), {
      name: alarmNameForSchedule("sched-cancelled"),
      scheduledTime: NOW + 10000,
    } as chrome.alarms.Alarm);

    mockSession();
    mockScheduledList([]); // plus aucun job actif

    await resyncAlarms();

    expect(chromeHelpers.clear).toHaveBeenCalledWith(alarmNameForSchedule("sched-cancelled"));
    expect(chromeHelpers.alarmsStore.has(alarmNameForSchedule("sched-cancelled"))).toBe(false);
  });

  it("job modifie (scheduled_for change) -> l'alarme est replanifiee a la nouvelle date", async () => {
    const oldWhen = NOW + 60 * 60 * 1000;
    chromeHelpers.alarmsStore.set(alarmNameForSchedule("sched-1"), { name: alarmNameForSchedule("sched-1"), scheduledTime: oldWhen } as chrome.alarms.Alarm);

    mockSession();
    const newScheduledFor = new Date(NOW + 3 * 60 * 60 * 1000).toISOString(); // +3h
    mockScheduledList([futureJob({ id: "sched-1", scheduled_for: newScheduledFor })]);

    await resyncAlarms();

    expect(chromeHelpers.create).toHaveBeenCalledWith(alarmNameForSchedule("sched-1"), { when: new Date(newScheduledFor).getTime() });
    expect(chromeHelpers.alarmsStore.get(alarmNameForSchedule("sched-1"))?.scheduledTime).toBe(new Date(newScheduledFor).getTime());
  });

  it("cree/rafraichit systematiquement l'alarme de sweep", async () => {
    mockSession();
    mockScheduledList([]);

    await resyncAlarms();

    expect(chromeHelpers.create).toHaveBeenCalledWith(REPUBLISH_SWEEP_ALARM_NAME, { periodInMinutes: 5, delayInMinutes: 5 });
  });
});

describe("declenchement d'une alarme de job (JOB_DUE)", () => {
  it("job du (scheduled, scheduled_for <= now) -> log REPUBLISH_SCHEDULER_JOB_DUE puis tente l'execution (executeClaimedSchedule)", async () => {
    const job = dueJob();
    mockSession();
    mockSingleJob(job);

    await chromeHelpers.fireAlarm(alarmNameForSchedule(job.id));

    expect(logger.info).toHaveBeenCalledWith(
      "REPUBLISH_SCHEDULER_JOB_DUE",
      expect.objectContaining({
        scheduleId: job.id,
        listingId: job.listing_id,
        scheduledFor: job.scheduled_for,
        latenessMs: expect.any(Number),
      })
    );
    // Round 4 : la detection delegue desormais l'execution a
    // executeClaimedSchedule() (mocke ici, teste separement) -- ce fichier
    // ne verifie que le CABLAGE (le bon scheduleId est bien transmis),
    // jamais la logique de claim/execution elle-meme.
    expect(executeClaimedSchedule).toHaveBeenCalledWith(job.id);
  });

  it("job introuvable (supprime) -> aucun log JOB_DUE, aucune tentative d'execution", async () => {
    mockSession();
    mockSingleJob(null);

    await chromeHelpers.fireAlarm(alarmNameForSchedule("sched-gone"));

    expect(logger.info).not.toHaveBeenCalledWith("REPUBLISH_SCHEDULER_JOB_DUE", expect.anything());
    expect(executeClaimedSchedule).not.toHaveBeenCalled();
  });

  it("job plus au statut scheduled (deja annule) -> aucun log JOB_DUE, aucune tentative d'execution", async () => {
    mockSession();
    mockSingleJob(dueJob({ status: "cancelled" }));

    await chromeHelpers.fireAlarm(alarmNameForSchedule("sched-2"));

    expect(logger.info).not.toHaveBeenCalledWith("REPUBLISH_SCHEDULER_JOB_DUE", expect.anything());
    expect(executeClaimedSchedule).not.toHaveBeenCalled();
  });

  it("alarme inconnue (prefixe non reconnu, ni sweep) -> ignoree, aucun appel Supabase, aucun log, aucune execution", async () => {
    await chromeHelpers.fireAlarm("une-autre-feature:xyz");

    expect(getValidAccessToken).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalledWith("REPUBLISH_SCHEDULER_JOB_DUE", expect.anything());
    expect(logger.info).not.toHaveBeenCalledWith("REPUBLISH_SCHEDULER_SWEEP_DUE_JOB", expect.anything());
    expect(executeClaimedSchedule).not.toHaveBeenCalled();
  });
});

describe("sweep periodique", () => {
  it("trouve un job depasse, logue REPUBLISH_SCHEDULER_SWEEP_DUE_JOB, et tente l'execution", async () => {
    const job = dueJob();
    mockSession();
    mockScheduledList([job]);

    await chromeHelpers.fireAlarm(REPUBLISH_SWEEP_ALARM_NAME);

    expect(logger.info).toHaveBeenCalledWith(
      "REPUBLISH_SCHEDULER_SWEEP_DUE_JOB",
      expect.objectContaining({ scheduleId: job.id, listingId: job.listing_id, scheduledFor: job.scheduled_for })
    );
    expect(executeClaimedSchedule).toHaveBeenCalledWith(job.id);
  });

  it("ignore un job encore futur, aucune tentative d'execution", async () => {
    mockSession();
    mockScheduledList([futureJob()]);

    await chromeHelpers.fireAlarm(REPUBLISH_SWEEP_ALARM_NAME);

    expect(logger.info).not.toHaveBeenCalledWith("REPUBLISH_SCHEDULER_SWEEP_DUE_JOB", expect.anything());
    expect(executeClaimedSchedule).not.toHaveBeenCalled();
  });
});

describe("onStartup", () => {
  it("detecte un job deja depasse au demarrage -> REPUBLISH_SCHEDULER_STARTUP_OVERDUE", async () => {
    const job = dueJob();
    mockSession();
    mockScheduledList([job]);

    await handleExtensionStartup();

    expect(logger.warn).toHaveBeenCalledWith(
      "REPUBLISH_SCHEDULER_STARTUP_OVERDUE",
      expect.objectContaining({ scheduleId: job.id, listingId: job.listing_id, scheduledFor: job.scheduled_for })
    );
    // Round 4 (constrainte explicite) : onStartup reste detection +
    // resynchronisation UNIQUEMENT, jamais un troisieme executeur -- seule
    // l'alarme (recreee par resyncAlarms juste apres, avec un `when` deja
    // passe) declenchera l'execution via le chemin normal.
    expect(executeClaimedSchedule).not.toHaveBeenCalled();
  });

  it("resynchronise aussi les alarmes au demarrage (pas seulement le log)", async () => {
    mockSession();
    mockScheduledList([futureJob()]);

    await handleExtensionStartup();

    expect(chromeHelpers.create).toHaveBeenCalledWith(alarmNameForSchedule("sched-1"), expect.objectContaining({ when: expect.any(Number) }));
  });

  it("aucune session valide -> aucun crash, resync silencieuse", async () => {
    mockNoSession();

    await expect(handleExtensionStartup()).resolves.toBeUndefined();
    expect(logger.warn).not.toHaveBeenCalledWith("REPUBLISH_SCHEDULER_STARTUP_OVERDUE", expect.anything());
  });
});

describe("initRepublishScheduler", () => {
  it("enregistre les listeners onAlarm/onStartup et cree l'alarme de sweep", () => {
    mockSession();
    mockScheduledList([]);

    initRepublishScheduler();

    expect(chromeHelpers.chromeMock.alarms.onAlarm.addListener).toHaveBeenCalledTimes(1);
    expect(chromeHelpers.chromeMock.runtime.onStartup.addListener).toHaveBeenCalledTimes(1);
    expect(chromeHelpers.create).toHaveBeenCalledWith(REPUBLISH_SWEEP_ALARM_NAME, { periodInMinutes: 5, delayInMinutes: 5 });
  });
});
