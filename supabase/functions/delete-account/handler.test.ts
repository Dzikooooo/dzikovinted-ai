import { assertEquals } from "jsr:@std/assert";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { deleteUserAccount } from "./handler.ts";

// "sans JWT -> 401" n'est pas redupliqué ici : index.ts fait sa propre
// vérification avant d'appeler deleteUserAccount(), qui ne reçoit qu'un
// userId déjà résolu -- même découpage que create-portal-session.

function fakeSupabaseAdmin(opts: {
  expectedBucket?: string;
  listResult?: { data: { name: string }[] | null; error: { message: string } | null };
  removeResult?: { error: { message: string } | null };
  deleteUserResult?: { error: { message: string } | null };
  onList?: (path: string) => void;
  onRemove?: (paths: string[]) => void;
  onDeleteUser?: (id: string) => void;
}): SupabaseClient {
  return {
    storage: {
      from(bucket: string) {
        if (opts.expectedBucket && bucket !== opts.expectedBucket) {
          throw new Error(`bucket inattendu : ${bucket}`);
        }
        return {
          async list(path: string) {
            opts.onList?.(path);
            return opts.listResult ?? { data: [], error: null };
          },
          async remove(paths: string[]) {
            opts.onRemove?.(paths);
            return opts.removeResult ?? { data: null, error: null };
          },
        };
      },
    },
    auth: {
      admin: {
        async deleteUser(id: string) {
          opts.onDeleteUser?.(id);
          return opts.deleteUserResult ?? { error: null };
        },
      },
    },
  } as unknown as SupabaseClient;
}

Deno.test("succes : liste les photos de l'utilisateur, les supprime, puis supprime le compte auth", async () => {
  let listedPath = "";
  let removedPaths: string[] = [];
  let deletedId = "";
  const admin = fakeSupabaseAdmin({
    expectedBucket: "listing-images",
    listResult: { data: [{ name: "a.jpg" }, { name: "b.jpg" }], error: null },
    onList: (p) => {
      listedPath = p;
    },
    onRemove: (p) => {
      removedPaths = p;
    },
    onDeleteUser: (id) => {
      deletedId = id;
    },
  });

  const result = await deleteUserAccount({ supabaseAdmin: admin }, "user-1");

  assertEquals(result, { ok: true });
  assertEquals(listedPath, "user-1");
  assertEquals(removedPaths, ["user-1/a.jpg", "user-1/b.jpg"]);
  assertEquals(deletedId, "user-1");
});

Deno.test("aucune photo dans le bucket : remove() n'est jamais appelé", async () => {
  const admin = fakeSupabaseAdmin({
    listResult: { data: [], error: null },
    onRemove: () => {
      throw new Error("remove() ne devrait jamais etre appele sans fichier a supprimer");
    },
  });

  const result = await deleteUserAccount({ supabaseAdmin: admin }, "user-1");
  assertEquals(result, { ok: true });
});

Deno.test("le listage des photos échoue : la suppression du compte n'est PAS bloquée", async () => {
  let deletedId = "";
  const admin = fakeSupabaseAdmin({
    listResult: { data: null, error: { message: "network down" } },
    onDeleteUser: (id) => {
      deletedId = id;
    },
  });

  const result = await deleteUserAccount({ supabaseAdmin: admin }, "user-1");
  assertEquals(result, { ok: true });
  assertEquals(deletedId, "user-1");
});

Deno.test("la suppression des photos échoue : la suppression du compte n'est PAS bloquée", async () => {
  let deletedId = "";
  const admin = fakeSupabaseAdmin({
    listResult: { data: [{ name: "a.jpg" }], error: null },
    removeResult: { error: { message: "network down" } },
    onDeleteUser: (id) => {
      deletedId = id;
    },
  });

  const result = await deleteUserAccount({ supabaseAdmin: admin }, "user-1");
  assertEquals(result, { ok: true });
  assertEquals(deletedId, "user-1");
});

Deno.test("la suppression du compte auth échoue : erreur honnête remontée, jamais un faux succès", async () => {
  const admin = fakeSupabaseAdmin({
    deleteUserResult: { error: { message: "internal" } },
  });

  const result = await deleteUserAccount({ supabaseAdmin: admin }, "user-1");

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.status, 500);
  }
});
