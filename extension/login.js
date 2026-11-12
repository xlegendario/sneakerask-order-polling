/*
 * Signing back in to SneakerAsk.
 *
 * SneakerAsk logs the seller out every so often and sends the tab to /home.
 * The checker then failed every job with "Wrong URL" until someone signed
 * in by hand. This walks the sign-in itself: email + password on /signin,
 * then the one-time code.
 *
 * One step per call. Each call reads the page as it is now, does the one
 * thing that page asks for and returns, so a full page load between the
 * password and the code screen does not lose the flow - the background
 * just injects the step again.
 *
 * Credentials live in chrome.storage.local, set from the popup. They are
 * never in this file, so they never reach GitHub.
 */

const SIGNIN_URL = "https://sell.sneakerask.com/signin";
const LOGIN_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_STEPS = 12;

export async function ensureLoggedIn(tabId, sourcingUrl) {
  const tab = await chrome.tabs.get(tabId);

  if (isProductsUrl(tab.url)) return true;

  const settings = await chrome.storage.local.get([
    "saEmail",
    "saPassword",
    "saOtp",
    "lastLoginAttemptAt"
  ]);

  if (!settings.saEmail || !settings.saPassword) {
    await setLoginStatus("Not signed in, and no SneakerAsk login saved in the popup");
    return false;
  }

  const sinceLast = Date.now() - Number(settings.lastLoginAttemptAt || 0);

  if (sinceLast < LOGIN_COOLDOWN_MS) {
    console.log("⏸️ Signed out, but the last sign-in attempt was less than 5 minutes ago");
    return false;
  }

  await chrome.storage.local.set({ lastLoginAttemptAt: Date.now() });

  console.log("🔐 Signed out of SneakerAsk, signing in...");

  await chrome.tabs.update(tabId, { url: SIGNIN_URL, active: true });
  await waitForTabLoad(tabId);

  const credentials = {
    email: settings.saEmail,
    password: settings.saPassword,
    otp: String(settings.saOtp || "123456")
  };

  let lastStep = null;

  for (let i = 0; i < MAX_STEPS; i++) {
    await sleep(2000);

    const current = await chrome.tabs.get(tabId);

    if (isSignedInUrl(current.url)) {
      break;
    }

    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: signInStep,
      args: [credentials, lastStep]
    });

    const step = injection?.result || { state: "ERROR", reason: "No result from page" };

    console.log("🔐 Sign-in step:", step);

    if (step.state === "ERROR") {
      await setLoginStatus(`Sign-in failed: ${step.reason}`);
      return false;
    }

    lastStep = step.state;
  }

  await chrome.tabs.update(tabId, { url: sourcingUrl, active: true });
  await waitForTabLoad(tabId);
  await sleep(3000);

  const after = await chrome.tabs.get(tabId);

  if (!isProductsUrl(after.url)) {
    await setLoginStatus(`Sign-in did not stick (ended on ${after.url})`);
    return false;
  }

  await setLoginStatus(`Signed in at ${new Date().toLocaleTimeString()}`);
  console.log("✅ Signed in to SneakerAsk");

  return true;
}

/*
 * Runs inside the page. Must be self-contained: executeScript serialises
 * this function, so nothing from the module scope is available here.
 */
async function signInStep(credentials, lastStep) {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);

    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };

  // React keeps its own copy of an input's value; setting .value directly
  // is ignored, so go through the native setter and fire input.
  const setValue = (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;

    input.focus();
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const findButton = (patterns) =>
    Array.from(document.querySelectorAll("button, [role='button'], input[type='submit']"))
      .filter(isVisible)
      .find((button) => {
        const text = String(button.innerText || button.value || "").trim().toLowerCase();
        return patterns.some((pattern) => pattern.test(text));
      });

  const pageText = document.body.innerText || "";

  const email = document.querySelector("input#email, input[name='email'], input[type='email']");
  const password = document.querySelector("input#password, input[name='password'], input[type='password']");

  // The code screen: either one field for the whole code, or one box per
  // digit. Recognised by what the field is, not by its label text.
  const inputs = Array.from(document.querySelectorAll("input")).filter(isVisible);

  const singleOtp = inputs.find((input) => {
    const hints = [input.autocomplete, input.name, input.id, input.placeholder, input.getAttribute("aria-label")]
      .join(" ")
      .toLowerCase();

    return (
      input.type !== "password" &&
      input.type !== "email" &&
      (/one-time-code|otp|code|verification|token/.test(hints) || input.maxLength === 6)
    );
  });

  const digitBoxes = inputs.filter((input) => input.maxLength === 1 && input.type !== "password");

  if (digitBoxes.length >= 4) {
    if (lastStep === "OTP_SUBMITTED" && /invalid|incorrect|expired|wrong/i.test(pageText)) {
      return { state: "ERROR", reason: "One-time code rejected" };
    }

    String(credentials.otp)
      .split("")
      .slice(0, digitBoxes.length)
      .forEach((digit, index) => setValue(digitBoxes[index], digit));

    await wait(500);

    // Many code screens submit on the last digit; click only if a button is still there.
    const verify = findButton([/verify/, /confirm/, /continue/, /submit/, /sign in/, /log in/]);
    if (verify && !verify.disabled) verify.click();

    return { state: "OTP_SUBMITTED", via: "digit boxes" };
  }

  if (singleOtp && !(email && isVisible(email))) {
    if (lastStep === "OTP_SUBMITTED" && /invalid|incorrect|expired|wrong/i.test(pageText)) {
      return { state: "ERROR", reason: "One-time code rejected" };
    }

    setValue(singleOtp, String(credentials.otp));
    await wait(500);

    const verify = findButton([/verify/, /confirm/, /continue/, /submit/, /sign in/, /log in/]);
    if (verify && !verify.disabled) verify.click();

    return { state: "OTP_SUBMITTED", via: "single field" };
  }

  if (email && password && isVisible(email)) {
    if (lastStep === "CREDENTIALS_SUBMITTED" && /invalid|incorrect|wrong|not found/i.test(pageText)) {
      return { state: "ERROR", reason: "Email or password rejected" };
    }

    if (lastStep === "CREDENTIALS_SUBMITTED") {
      // Still on the form after submitting: give the request time.
      return { state: "WAITING", reason: "Still on the sign-in form" };
    }

    setValue(email, credentials.email);
    setValue(password, credentials.password);
    await wait(400);

    const signIn = findButton([/^sign in$/, /^log in$/, /^login$/, /^continue$/]);

    if (!signIn) {
      return { state: "ERROR", reason: "Sign In button not found" };
    }

    signIn.click();

    return { state: "CREDENTIALS_SUBMITTED" };
  }

  return { state: "WAITING", reason: `Nothing to fill on ${location.pathname}` };
}

function isProductsUrl(url) {
  return /^https:\/\/sell\.sneakerask\.com\/products/.test(String(url || ""));
}

function isSignedInUrl(url) {
  const path = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return "";
    }
  })();

  return path !== "" && !["/signin", "/home", "/", "/verify", "/otp"].some((p) => path === p || path.startsWith(`${p}/`));
}

async function setLoginStatus(message) {
  console.log(`🔐 ${message}`);
  await chrome.storage.local.set({ loginStatus: message });
}

function waitForTabLoad(tabId, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const timer = setTimeout(done, timeoutMs);

    function done() {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }

    function listener(id, info) {
      if (id === tabId && info.status === "complete") done();
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
