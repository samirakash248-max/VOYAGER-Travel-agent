// --- FORM VALIDATION ---

// I wrote this function to check if the form inputs are valid
function validateForm() {
  let isValid = true;

  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const emailGroup = document.getElementById("emailGroup");
  const passwordGroup = document.getElementById("passwordGroup");

  // reset errors first
  emailGroup.classList.remove("has-error");
  passwordGroup.classList.remove("has-error");

  // check email - .includes('@') is a quick check but type="email" helps too
  if (!emailInput.value || !emailInput.value.includes("@")) {
    emailGroup.classList.add("has-error");
    isValid = false;
  }

  // check password length
  if (passwordInput.value.length < 6) {
    passwordGroup.classList.add("has-error");
    isValid = false;
  }

  return isValid;
}

// this runs when the form is submitted
function handleLogin(event) {
  event.preventDefault(); // stop the browser from reloading

  if (!validateForm()) return; // stop if there are errors

  const btn = document.getElementById("loginBtn");

  // show loading state while "logging in"
  btn.textContent = "Logging you in...";
  btn.disabled = true;
  btn.style.opacity = "0.75";

  // pretend we're calling an API (setTimeout simulates a delay)
  setTimeout(() => {
    btn.textContent = "Welcome back!";
    btn.style.background = "linear-gradient(135deg, #2ecc71, #27ae60)";

    // in a real project I'd redirect here: window.location.href = '/dashboard';
    setTimeout(() => {
      alert("Login successful! (Redirect to dashboard goes here)");
      btn.textContent = "LOG IN";
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.style.background = "";
    }, 1200);
  }, 1800);
}


// social login placeholder - connect OAuth later
function socialLogin(provider) {
  alert(`${provider} login coming soon! (OAuth integration needed)`);
}

// clear error styling when user starts typing again
document.getElementById("email").addEventListener("input", function () {
  document.getElementById("emailGroup").classList.remove("has-error");
});

document.getElementById("password").addEventListener("input", function () {
  document.getElementById("passwordGroup").classList.remove("has-error");
});
