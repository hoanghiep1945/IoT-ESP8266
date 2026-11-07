async function loadAuthenticatedProfile() {
  try {
    const response = await fetch("/api/profile", { cache: "no-store" });
    if (response.status === 401) {
      location.assign("login.html");
      return;
    }
    if (!response.ok) return;
    const data = await response.json();
    const user = data.user;
    if (!user) return;

    document.querySelectorAll(".side-account strong").forEach(node => {
      node.textContent = user.fullName || user.username;
    });

    const nameParts = String(user.fullName || user.username).trim().split(/\s+/).filter(Boolean);
    const initials = nameParts.slice(-2).map(part => part[0]).join("").toUpperCase();
    document.querySelectorAll(".user-link .avatar").forEach(node => {
      node.textContent = initials || "U";
    });
    document.querySelectorAll(".user-link > span:last-child").forEach(node => {
      const textNode = Array.from(node.childNodes).find(child => child.nodeType === Node.TEXT_NODE && child.textContent.trim());
      if (textNode) textNode.textContent = (nameParts.slice(-2).join(" ") || user.username) + " ";
      const subtitle = node.querySelector("small");
      if (subtitle) subtitle.textContent = user.username;
    });

    document.querySelectorAll("[data-profile-name]").forEach(node => {
      node.textContent = user.fullName || user.username;
    });
    document.querySelectorAll("[data-profile-email]").forEach(node => {
      node.textContent = user.email;
    });
    document.querySelectorAll("[data-profile-username]").forEach(node => {
      node.textContent = user.username;
    });
  } catch {}
}
document.addEventListener("DOMContentLoaded", loadAuthenticatedProfile);
