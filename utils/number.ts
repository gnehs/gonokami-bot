let numberCache: { value: number | null; timestamp: number } = {
  value: null,
  timestamp: 0,
};

/**
 * Retrieve the latest calling number from the remote endpoint.
 * The result is cached for 1 minute to reduce network traffic.
 */
export async function getCurrentNumber(): Promise<number | null> {
  const now = Date.now();
  if (now - numberCache.timestamp < 60 * 1000 && numberCache.value !== null) {
    return numberCache.value;
  }

  try {
    const res = await fetch(
      "https://dxc.tagfans.com/mighty?_field%5B%5D=*&%24gid=10265&%24description=anouncingNumbers"
    )
      .then((x) => x.json())
      .then((x) => x.sort((a: any, b: any) => b.UpdDate - a.UpdDate));

    if (!res || res.length === 0) {
      return null;
    }

    const currentNumber = JSON.parse(res[0].detail_json).selections["目前號碼"];
    numberCache = {
      value: currentNumber,
      timestamp: now,
    };
    return currentNumber;
  } catch (e) {
    console.error("Failed to get current number:", e);
    return null;
  }
}
