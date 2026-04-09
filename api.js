async function withRetry(fn, label = "sbCall") {
  const delays = [500, 1500];
  for (let i = 0; i <= delays.length; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === delays.length) throw e;
      // Only retry on network errors, not 4xx
      if (e?.status >= 400 && e?.status < 500) throw e;
      console.warn(`[${label}] retry ${i + 1}/${delays.length} after ${delays[i]}ms:`, e?.message ?? e);
      await new Promise(r => setTimeout(r, delays[i]));
    }
  }
}

async function sbGet(path) {
  return withRetry(async () => {
    const r = await fetch(SUPABASE_URL + "/rest/v1/" + path, { headers: SB_HEADERS });
    if (!r.ok) {
      const err = new Error(await r.text());
      err.status = r.status;
      throw err;
    }
    return r.json();
  }, "sbGet");
}

async function sbPost(path, body) {
  return withRetry(async () => {
    const r = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
      method: "POST",
      headers: SB_HEADERS,
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const err = new Error(await r.text());
      err.status = r.status;
      throw err;
    }
    return r.json();
  }, "sbPost");
}

async function sbPatch(path, body) {
  return withRetry(async () => {
    const r = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
      method: "PATCH",
      headers: SB_HEADERS,
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const err = new Error(await r.text());
      err.status = r.status;
      throw err;
    }
    return r.json();
  }, "sbPatch");
}

async function sbDelete(path) {
  return withRetry(async () => {
    const r = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
      method: "DELETE",
      headers: SB_HEADERS
    });
    if (!r.ok) {
      const err = new Error(await r.text());
      err.status = r.status;
      throw err;
    }
  }, "sbDelete");
}
