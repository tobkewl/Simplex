// Welcome window JavaScript

const btnGetStarted = document.getElementById('btnGetStarted');

// Get Started button - close welcome and open settings
btnGetStarted.addEventListener('click', () => {
  window.settingsAPI.closeWelcomeWindow();
  setTimeout(() => {
    window.settingsAPI.openSettings();
  }, 200);
});

