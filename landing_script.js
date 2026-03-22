function toggleMenu() {
  document.getElementById("navLinks").classList.toggle("open");
}

window.addEventListener("scroll", () => {
  const nav = document.getElementById("navbar");
  nav.style.background =
    window.scrollY > 60 ? "rgba(10,22,40,0.98)" : "rgba(10,22,40,0.92)";
});

document.querySelectorAll(".nav-links a").forEach((a) => {
  a.addEventListener("click", () => {
    document.getElementById("navLinks").classList.remove("open");
  });
});

// Card click — go to app if logged in, else login
async function bookPackage(destination) {
  try {
    const res  = await fetch('/api/me');
    const data = await res.json();
    if (data.loggedIn) {
      window.location.href = '/app?dest=' + encodeURIComponent(destination);
    } else {
      window.location.href = '/login?dest=' + encodeURIComponent(destination);
    }
  } catch {
    window.location.href = '/login?dest=' + encodeURIComponent(destination);
  }
}
