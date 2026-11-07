function setupDevices() {
  const minimumLoadingTime = 850;
  document.querySelectorAll('.device').forEach(device => {
    const id = device.querySelector('h3').textContent.trim().toLowerCase();
    const input = device.querySelector('input');
    const control = device.querySelector('.device-control');
    const stateLabel = device.querySelector('.device-state');
    let confirmedState = input.checked;
    input.disabled = true;
    stateLabel.setAttribute('aria-live', 'polite');

    input.addEventListener('change', async () => {
      const requestedState = input.checked;
      const startedAt = performance.now();
      input.checked = confirmedState;
      input.disabled = true;
      stateLabel.textContent = '';
      control.classList.remove('error');
      control.classList.add('loading');
      control.setAttribute('aria-busy', 'true');
      control.removeAttribute('title');
      try {
        const response = await fetch('/api/devices/' + encodeURIComponent(id), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: requestedState })
        });
        const result = await response.json().catch(() => ({}));
        if (response.status === 401) {
          location.assign('login.html');
          return;
        }
        if (!response.ok) throw new Error(result.error || 'Không gửi được lệnh tới mạch.');
        confirmedState = typeof result.leds?.[id] === 'boolean' ? result.leds[id] : requestedState;
        input.checked = confirmedState;
      } catch (error) {
        input.checked = confirmedState;
        control.title = error.message || 'Không gửi được lệnh tới mạch.';
        control.classList.add('error');
        stateLabel.textContent = 'Lỗi';
      } finally {
        const remaining = minimumLoadingTime - (performance.now() - startedAt);
        if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
        input.disabled = false;
        control.classList.remove('loading');
        control.setAttribute('aria-busy', 'false');
      }
    });

    fetch('/api/state', { cache: 'no-store' }).then(async response => {
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        location.assign('login.html');
        return;
      }
      if (!response.ok || !data.leds || typeof data.leds[id] !== 'boolean') {
        throw new Error(data.error || 'Backend chưa trả trạng thái thiết bị.');
      }
      confirmedState = data.leds[id];
      input.checked = confirmedState;
      stateLabel.textContent = '';
      control.classList.remove('error');
      control.removeAttribute('title');
    }).catch(error => {
      control.title = error.message || 'Không kết nối được backend.';
      control.classList.add('error');
      stateLabel.textContent = 'Lỗi';
    }).finally(() => {
      input.disabled = false;
    });
  });
}

setupDevices();
