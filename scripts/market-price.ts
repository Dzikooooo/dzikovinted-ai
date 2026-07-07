import { getEbaySoldPrice } from "./ebay-sold";
export async function getMarketPrice(item: any) {

    const ebay = await getEbaySoldPrice(item.title);

    if (ebay.average > 0) {
        return {
            marketPrice: ebay.average,
            confidence: ebay.confidence,
            source: "eBay Sold"
        };
    }

    const title = item.title.toLowerCase();

    let fallbackPrice = item.price * 2;
    
    if (title.includes("shox tl")) fallbackPrice = 140;
    else if (title.includes("tn")) fallbackPrice = 120;
    else if (title.includes("xt-6")) fallbackPrice = 150;
    else if (title.includes("2002r")) fallbackPrice = 110;
    else if (title.includes("samba")) fallbackPrice = 95;
    else if (title.includes("campus")) fallbackPrice = 90;
    else if (title.includes("detroit")) fallbackPrice = 180;
    else if (title.includes("active jacket")) fallbackPrice = 160;
    else if (title.includes("nuptse")) fallbackPrice = 180;
    else if (title.includes("stone island")) fallbackPrice = 180;
    else if (title.includes("cp company")) fallbackPrice = 150;
    else if (title.includes("zip hoodie")) fallbackPrice = 75;
    else if (title.includes("stussy")) fallbackPrice = 95;
    else if (title.includes("501")) fallbackPrice = 50;
    else if (title.includes("diesel")) fallbackPrice = 70;
    
    return {
      marketPrice: fallbackPrice,
      confidence: 70,
      source: "Fallback"
    };
}