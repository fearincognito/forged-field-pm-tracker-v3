/* Use Enabled / Disabled terminology for user account status in the UI. */
(function () {
  function relabelUserStatus() {
    const usersCard = document.querySelector('#usersCard small');
    if (usersCard && /\bactive user(s)?\b/i.test(usersCard.textContent)) {
      usersCard.textContent = usersCard.textContent.replace(/active user/gi, 'enabled user');
    }

    document.querySelectorAll('.detail-item small').forEach(label => {
      if (label.textContent.trim() === 'Active') label.textContent = 'Enabled';
    });

    const statusSelect = document.querySelector('#editUserActive');
    if (statusSelect) {
      const enabledOption = statusSelect.querySelector('option[value="true"]');
      const disabledOption = statusSelect.querySelector('option[value="false"]');
      if (enabledOption) enabledOption.textContent = 'Enabled';
      if (disabledOption) disabledOption.textContent = 'Disabled';
    }

    const usersHeading = Array.from(document.querySelectorAll('h2')).find(h => h.textContent.trim() === 'Users & Access');
    const usersSection = usersHeading?.closest('section.card');
    if (usersSection) {
      usersSection.querySelectorAll('article.inset-card.compact-card > .section-heading > span').forEach(status => {
        const text = status.textContent || '';
        if (!/Disabled/.test(text) && !/Enabled/.test(text)) {
          status.append(document.createTextNode(' · Enabled'));
        }
      });
    }
  }

  const observer = new MutationObserver(relabelUserStatus);
  observer.observe(document.body, { childList: true, subtree: true });
  relabelUserStatus();
})();
