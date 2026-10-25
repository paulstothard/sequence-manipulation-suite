// Samples the exported artwork, so selection handles and checkerboards never
// affect the result. Image dimensions retain the editors' existing limits.
export function createImageColorSampler(viewport, { image, render, size }) {
  let cancel;
  function sample({ signal } = {}) {
    cancel?.();
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const layer = document.createElement('div');
      layer.className = 'image-color-sampler'; layer.tabIndex = 0;
      layer.setAttribute('role', 'button'); layer.setAttribute('aria-label', 'Image color sampler');
      const instruction = document.createElement('span');
      instruction.className = 'image-color-instruction'; instruction.setAttribute('role', 'status');
      instruction.textContent = 'Preparing eyedropper…';
      const lens = document.createElement('canvas'); lens.width = lens.height = 99;
      lens.className = 'image-color-lens'; lens.hidden = true;
      const swatch = document.createElement('span'); swatch.className = 'image-color-sample';
      layer.append(instruction, lens, swatch); viewport.append(layer);
      const canvas = document.createElement('canvas'), dimensions = size();
      canvas.width = dimensions.width; canvas.height = dimensions.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      let ready = false, done = false, x = Math.floor(canvas.width / 2), y = Math.floor(canvas.height / 2), color, url, timer;
      function finish(value, error) {
        if (done) return;
        done = true; clearTimeout(timer); controller.abort(); observer.disconnect();
        signal?.removeEventListener('abort', abort);
        layer.remove(); if (url) URL.revokeObjectURL(url);
        canvas.width = canvas.height = 1; cancel = undefined;
        error ? reject(error) : resolve(value);
      }
      const abort = () => finish(null);
      cancel = abort;
      function position() {
        const bounds = image()?.getBoundingClientRect(), host = viewport.getBoundingClientRect();
        if (!bounds?.width || !bounds.height) { finish(null); return; }
        Object.assign(layer.style, {
          left: `${bounds.left - host.left + viewport.scrollLeft - viewport.clientLeft}px`,
          top: `${bounds.top - host.top + viewport.scrollTop - viewport.clientTop}px`,
          width: `${bounds.width}px`, height: `${bounds.height}px`,
        });
      }
      function preview() {
        if (!ready) return;
        const rgba = context.getImageData(x, y, 1, 1).data;
        color = '#' + Array.from(rgba).map(n => n.toString(16).padStart(2, '0')).join('');
        if (rgba[3] === 255) color = color.slice(0, 7);
        swatch.style.setProperty('--swatch-color', color);
        const ctx = lens.getContext('2d'); ctx.clearRect(0, 0, 99, 99); ctx.imageSmoothingEnabled = false;
        ctx.drawImage(canvas, x - 5, y - 5, 11, 11, 0, 0, 99, 99);
        ctx.strokeStyle = 'white'; ctx.lineWidth = 3; ctx.strokeRect(44, 44, 11, 11);
        ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.strokeRect(44, 44, 11, 11);
        lens.hidden = false;
        const px = (x + .5) / canvas.width * layer.clientWidth, py = (y + .5) / canvas.height * layer.clientHeight;
        lens.style.left = `${Math.max(0, Math.min(layer.clientWidth - 101, px + 18))}px`;
        lens.style.top = `${Math.max(0, Math.min(layer.clientHeight - 101, py - 115))}px`;
      }
      function point(event) {
        const b = layer.getBoundingClientRect();
        x = Math.max(0, Math.min(canvas.width - 1, Math.floor((event.clientX - b.left) / b.width * canvas.width)));
        y = Math.max(0, Math.min(canvas.height - 1, Math.floor((event.clientY - b.top) / b.height * canvas.height)));
        preview();
      }
      for (const type of ['pointerdown', 'pointerup', 'pointermove']) layer.addEventListener(type, event => {
        event.stopPropagation(); event.preventDefault();
        if (type !== 'pointerup') point(event);
      });
      layer.addEventListener('click', event => { event.stopPropagation(); event.preventDefault(); if (ready) { point(event); finish(color); } });
      layer.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); finish(null); }
        else if (ready && ['Enter', ' '].includes(event.key)) { event.preventDefault(); finish(color); }
        else if (ready && event.key.startsWith('Arrow')) {
          event.preventDefault(); const delta = event.shiftKey ? 10 : 1;
          x = Math.max(0, Math.min(canvas.width - 1, x + (event.key === 'ArrowRight' ? delta : event.key === 'ArrowLeft' ? -delta : 0)));
          y = Math.max(0, Math.min(canvas.height - 1, y + (event.key === 'ArrowDown' ? delta : event.key === 'ArrowUp' ? -delta : 0)));
          preview();
        } else if (event.key === 'Tab') { event.preventDefault(); finish(null); }
      });
      document.addEventListener('pointerdown', event => {
        if (event.composedPath().includes(layer)) return;
        event.preventDefault(); event.stopImmediatePropagation(); finish(null);
      }, { capture: true, signal: controller.signal });
      const observer = new ResizeObserver(position); observer.observe(viewport);
      position(); layer.focus({ preventScroll: true });
      if (done) return;
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { finish(null); return; }
      timer = setTimeout(() => finish(null, new Error('Could not prepare the image for color sampling.')), 15000);
      const raster = new Image();
      raster.onload = () => {
        if (done) return;
        try {
          context.drawImage(raster, 0, 0, canvas.width, canvas.height);
          ready = true; clearTimeout(timer);
          instruction.textContent = 'Click to sample · Esc to cancel';
          preview();
        } catch { finish(null, new Error('This image could not be sampled.')); }
      };
      raster.onerror = () => finish(null, new Error('This image could not be sampled.'));
      try { url = URL.createObjectURL(new Blob([render()], { type: 'image/svg+xml' })); raster.src = url; }
      catch (error) { finish(null, error); }
    });
  }
  return { sample, dispose() { cancel?.(); } };
}
