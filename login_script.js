// ── FORM VALIDATION ──
function validateForm() {
  let isValid = true;

  const emailInput    = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const emailGroup    = document.getElementById('emailGroup');
  const passwordGroup = document.getElementById('passwordGroup');

  emailGroup.classList.remove('has-error');
  passwordGroup.classList.remove('has-error');
  hideServerError();

  if (!emailInput.value || !emailInput.value.includes('@')) {
    emailGroup.classList.add('has-error');
    isValid = false;
  }

  if (passwordInput.value.length < 6) {
    passwordGroup.classList.add('has-error');
    isValid = false;
  }

  return isValid;
}

// ── SERVER ERROR / SUCCESS BANNERS ──
function showServerError(msg) {
  const el = document.getElementById('serverError');
  el.textContent = msg;
  el.classList.add('visible');
}

function hideServerError() {
  const el = document.getElementById('serverError');
  el.classList.remove('visible');
}

// ── HANDLE LOGIN — hits /auth/login on the Express server ──
async function handleLogin(event) {
  event.preventDefault();
  if (!validateForm()) return;

  const btn      = document.getElementById('loginBtn');
  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const remember = document.getElementById('rememberMe').checked;

  // loading state
  btn.textContent = 'Logging you in...';
  btn.disabled    = true;

  try {
    const res  = await fetch('/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password, remember })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      // success
      btn.textContent        = '✅  Welcome back!';
      btn.style.background   = 'linear-gradient(135deg, #2ecc71, #27ae60)';
      btn.style.color        = 'white';

      // redirect after short delay
      setTimeout(() => {
        window.location.href = data.redirect || '/';
      }, 1000);

    } else {
      // server returned an error (wrong password, user not found, etc.)
      showServerError(data.message || 'Login failed. Please try again.');
      btn.textContent = 'LOG IN';
      btn.disabled    = false;
      btn.style.background = '';
    }

  } catch (err) {
    // network error — server probably not running
    showServerError('Cannot reach the server. Is it running?');
    btn.textContent = 'LOG IN';
    btn.disabled    = false;
  }
}

// ── TOGGLE PASSWORD VISIBILITY ──
function togglePassword() {
  const input   = document.getElementById('password');
  const icon    = document.getElementById('eyeIcon');
  const showing = input.type === 'text';

  input.type        = showing ? 'password' : 'text';
  icon.className    = showing ? 'fa-regular fa-eye' : 'fa-regular fa-eye-slash';
}

// ── SOCIAL LOGIN (placeholder) ──
function socialLogin(provider) {
  alert(`${provider} login coming soon! (OAuth integration needed)`);
}

// ── CLEAR ERRORS ON INPUT ──
document.getElementById('email').addEventListener('input', () => {
  document.getElementById('emailGroup').classList.remove('has-error');
  hideServerError();
});

document.getElementById('password').addEventListener('input', () => {
  document.getElementById('passwordGroup').classList.remove('has-error');
  hideServerError();
});
