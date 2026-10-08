/* Show / hide password control for the login screen. */
(function () {
  const password = document.querySelector("#loginForm #password");
  if (!password || document.querySelector("#loginPasswordToggle")) return;

  const style = document.createElement("style");
  style.id = "loginPasswordToggleStyles";
  style.textContent = `
    .login-password-wrap{position:relative;display:flex;align-items:center;}
    .login-password-wrap input{width:100%;padding-right:72px;box-sizing:border-box;}
    .login-password-toggle{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:auto!important;min-width:54px!important;margin:0!important;padding:5px 8px!important;border:0!important;border-radius:6px!important;background:transparent!important;color:#2b6f9d!important;font-size:12px!important;font-weight:800!important;line-height:1!important;box-shadow:none!important;}
    .login-password-toggle:hover,.login-password-toggle:focus{background:#edf4f8!important;}
  `;
  document.head.appendChild(style);

  const wrap = document.createElement("div");
  wrap.className = "login-password-wrap";
  password.parentNode.insertBefore(wrap, password);
  wrap.appendChild(password);

  const toggle = document.createElement("button");
  toggle.id = "loginPasswordToggle";
  toggle.className = "login-password-toggle";
  toggle.type = "button";
  toggle.textContent = "Show";
  toggle.setAttribute("aria-label", "Show password");
  toggle.setAttribute("aria-pressed", "false");
  wrap.appendChild(toggle);

  toggle.addEventListener("click", () => {
    const showing = password.type === "text";
    password.type = showing ? "password" : "text";
    toggle.textContent = showing ? "Show" : "Hide";
    toggle.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    toggle.setAttribute("aria-pressed", showing ? "false" : "true");
    password.focus({ preventScroll: true });
  });
})();
