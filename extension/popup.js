const statusDiv = document.getElementById("status");

document.getElementById("start").onclick = () => {
  chrome.runtime.sendMessage({ type: "START" });
  updateStatus();
};

document.getElementById("stop").onclick = () => {
  chrome.runtime.sendMessage({ type: "STOP" });
  updateStatus();
};

function updateStatus() {
  chrome.runtime.sendMessage({ type: "STATUS" }, (res) => {
    if (res?.running) {
      statusDiv.innerText = "Status: 🟢 Running";
    } else {
      statusDiv.innerText = "Status: 🔴 Stopped";
    }
  });
}

updateStatus();

const emailInput = document.getElementById("saEmail");
const passwordInput = document.getElementById("saPassword");
const otpInput = document.getElementById("saOtp");
const loginStatusDiv = document.getElementById("loginStatus");

chrome.storage.local.get(["saEmail", "saPassword", "saOtp", "loginStatus"], (data) => {
  emailInput.value = data.saEmail || "";
  passwordInput.value = data.saPassword || "";
  otpInput.value = data.saOtp || "123456";
  loginStatusDiv.innerText = data.loginStatus || "";
});

document.getElementById("saveLogin").onclick = async () => {
  await chrome.storage.local.set({
    saEmail: emailInput.value.trim(),
    saPassword: passwordInput.value,
    saOtp: otpInput.value.trim() || "123456",
    // A new login deserves an attempt now, not after the cooldown.
    lastLoginAttemptAt: 0
  });

  loginStatusDiv.innerText = "Login saved";
};
