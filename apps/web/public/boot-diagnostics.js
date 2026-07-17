(function () {
  var endpoint = "/api/client-errors";
  var sent = {};

  function safeText(value) {
    if (value === undefined || value === null) {
      return "";
    }
    return String(value).slice(0, 1000);
  }

  function collectPayload(kind, message, detail) {
    var visualViewport = window.visualViewport;
    return {
      kind: safeText(kind) || "client-error",
      message: safeText(message) || "Неизвестная ошибка клиента",
      url: window.location.href,
      userAgent: navigator.userAgent,
      platform: navigator.platform || null,
      viewport: {
        width: window.innerWidth || (visualViewport && visualViewport.width) || null,
        height: window.innerHeight || (visualViewport && visualViewport.height) || null
      },
      detail: detail || null
    };
  }

  function report(kind, message, detail) {
    var payload = collectPayload(kind, message, detail);
    var key = payload.kind + ":" + payload.message;
    if (sent[key]) {
      return;
    }
    sent[key] = true;

    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon(endpoint, blob)) {
          return;
        }
      }
    } catch (_error) {
      // fallback ниже
    }

    try {
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        keepalive: true
      }).catch(function () {});
    } catch (_error) {
      // Диагностика не должна ломать старт приложения.
    }
  }

  function showBootFallback(app) {
    var root = document.createElement("div");
    var card = document.createElement("div");
    var title = document.createElement("strong");
    var text = document.createElement("p");
    var button = document.createElement("button");

    root.className = "club-boot-fallback";
    root.setAttribute(
      "style",
      "min-height:100vh;min-height:100dvh;display:grid;place-items:center;padding:24px;background:#eef6ff;color:#111827;font-family:system-ui,-apple-system,Segoe UI,sans-serif;"
    );
    card.setAttribute(
      "style",
      "width:min(100%,360px);border:1px solid #cfe0ef;border-radius:18px;background:#fff;padding:22px;box-shadow:0 16px 40px rgba(15,23,42,.12);"
    );
    title.setAttribute("style", "display:block;font-size:20px;margin-bottom:8px;");
    title.textContent = "Не удалось открыть клуб";
    text.setAttribute("style", "margin:0 0 16px;color:#4b5563;line-height:1.45;");
    text.textContent = "Мы уже записали техническую ошибку. Попробуйте обновить приложение.";
    button.type = "button";
    button.setAttribute(
      "style",
      "width:100%;min-height:46px;border:0;border-radius:12px;background:#0b83b8;color:white;font-weight:800;font-size:16px;"
    );
    button.textContent = "Обновить";
    button.addEventListener("click", function () {
      window.location.reload();
    });

    card.appendChild(title);
    card.appendChild(text);
    card.appendChild(button);
    root.appendChild(card);
    app.replaceChildren(root);
  }

  window.__clubReportBootError = report;

  window.addEventListener("error", function (event) {
    report("window-error", event.message, {
      file: event.filename,
      line: event.lineno,
      column: event.colno
    });
  });

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    report("unhandledrejection", reason && (reason.stack || reason.message) ? reason.stack || reason.message : safeText(reason), null);
  });

  window.setTimeout(function () {
    var app = document.getElementById("app");
    if (!app || app.children.length || app.textContent.trim()) {
      return;
    }

    report("blank-screen", "Vue app did not mount", null);
    showBootFallback(app);
  }, 4500);
})();
