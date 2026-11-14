/* Private paired-device LAN transport. No STUN/TURN, server or public CB bus. */
(function () {
  var pc = null,
    dc = null;
  function ready(peer) {
    return new Promise(function (resolve) {
      if (peer.iceGatheringState === "complete") return resolve();
      var t = setTimeout(resolve, 4000);
      peer.addEventListener("icegatheringstatechange", function () {
        if (peer.iceGatheringState === "complete") {
          clearTimeout(t);
          resolve();
        }
      });
    });
  }
  function wire(channel) {
    dc = channel;
    dc.onopen = function () {
      window.Comp.localStatus(true);
    };
    dc.onclose = function () {
      window.Comp.localStatus(false);
    };
    dc.onmessage = function (e) {
      window.Comp.localReceive(String(e.data));
    };
  }
  function start() {
    if (pc) pc.close();
    pc = new RTCPeerConnection({ iceServers: [] });
    pc.ondatachannel = function (e) {
      wire(e.channel);
    };
    return pc;
  }
  window.CompLocal = {
    send: function (s) {
      if (!dc || dc.readyState !== "open") return false;
      dc.send(s);
      return true;
    },
    invite: async function () {
      if (!window.Comp.paired()) throw new Error("Pair these two devices first.");
      var p = start();
      // Hold permission briefly so LAN host candidates are available on Android/Chrome.
      try {
        var media = await navigator.mediaDevices.getUserMedia({ audio: true });
        setTimeout(function () {
          media.getTracks().forEach(function (t) {
            t.stop();
          });
        }, 10000);
      } catch (e) {}
      wire(p.createDataChannel("companion"));
      await p.setLocalDescription(await p.createOffer());
      await ready(p);
      return btoa(JSON.stringify(p.localDescription));
    },
    answer: async function (code) {
      if (!window.Comp.paired()) throw new Error("Pair these two devices first.");
      var p = start();
      try {
        var media = await navigator.mediaDevices.getUserMedia({ audio: true });
        setTimeout(function () {
          media.getTracks().forEach(function (t) {
            t.stop();
          });
        }, 10000);
      } catch (e) {}
      await p.setRemoteDescription(JSON.parse(atob(code.trim())));
      await p.setLocalDescription(await p.createAnswer());
      await ready(p);
      return btoa(JSON.stringify(p.localDescription));
    },
    accept: async function (code) {
      if (!pc) throw new Error("Create an invite first.");
      await pc.setRemoteDescription(JSON.parse(atob(code.trim())));
    },
    close: function () {
      if (pc) pc.close();
      pc = null;
      dc = null;
      window.Comp.localStatus(false);
    },
  };
  window.addEventListener("DOMContentLoaded", function () {
    var ui = document.getElementById("ui"),
      panel = document.createElement("details");
    panel.className = "comp-local";
    panel.innerHTML =
      '<summary>LOCAL WI-FI LINK <span id="local-state">OFF</span></summary><div class="comp-local-actions"><button id="local-invite" type="button">INVITE</button><button id="local-answer" type="button">ANSWER</button><button id="local-accept" type="button">CONNECT</button></div><textarea id="local-code" aria-label="Local connection code" placeholder="Connection code"></textarea><div id="local-note" role="status"></div>';
    ui.appendChild(panel);
    var code = document.getElementById("local-code"),
      note = document.getElementById("local-note");
    function act(fn) {
      return async function () {
        try {
          var result = await fn(code.value);
          if (result) {
            code.value = result;
            code.select();
          }
          note.textContent = "Both devices: same Wi-Fi or hotspot. Exchange invite, then reply.";
        } catch (e) {
          note.textContent = e.message;
        }
      };
    }
    document.getElementById("local-invite").onclick = act(window.CompLocal.invite);
    document.getElementById("local-answer").onclick = act(window.CompLocal.answer);
    document.getElementById("local-accept").onclick = act(window.CompLocal.accept);
  });
})();
