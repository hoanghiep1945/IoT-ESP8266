const form = document.getElementById("login-form");
if (form) {
  const error = form.querySelector(".form-error");
  const button = form.querySelector("button[type='submit']");

  form.addEventListener("submit", async event => {
    event.preventDefault();
    error.hidden = true;
    error.textContent = "";
    button.disabled = true;
    button.textContent = "Đang xác thực…";

    const fields = new FormData(form);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: fields.get("identifier"),
          password: fields.get("password")
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Đăng nhập không thành công.");
      location.assign("index.html");
    } catch (err) {
      error.textContent = err.message || "Không kết nối được backend.";
      error.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = "Đăng nhập";
    }
  });
}
