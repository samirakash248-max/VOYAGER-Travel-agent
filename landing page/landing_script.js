function toggleMenu() {
  document.getElementById("navLinks").classList.toggle("open");
}
// Navbar scroll effect
window.addEventListener("scroll", () => {
  const nav = document.getElementById("navbar");
  nav.style.background =
    window.scrollY > 60 ? "rgba(10,22,40,0.98)" : "rgba(10,22,40,0.92)";
});
// Close menu on link click
document.querySelectorAll(".nav-links a").forEach((a) => {
  a.addEventListener("click", () => {
    document.getElementById("navLinks").classList.remove("open");
  });
});
