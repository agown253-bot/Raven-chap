document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".tabs button");
  const authForms = document.querySelectorAll(".auth-form");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const mode = tab.dataset.mode;

      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      authForms.forEach((form) => {
        form.style.display =
          form.dataset.mode === mode ? "block" : "none";
      });
    });
  });

  // Affichage des messages
  window.showToast = function (message) {
    const toast = document.getElementById("toast");
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show");

    setTimeout(() => {
      toast.classList.remove("show");
    }, 3000);
  };

  // Gestion des formulaires
  document.querySelectorAll("form").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const button = form.querySelector("button[type='submit']");
      if (button) button.disabled = true;

      showToast("Connexion en cours...");

      setTimeout(() => {
        if (button) button.disabled = false;
      }, 1500);
    });
  });
});
