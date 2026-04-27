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
