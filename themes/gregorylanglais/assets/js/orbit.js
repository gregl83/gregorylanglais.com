// Shared illumination responds to mouse, keyboard, and touch without moving links.
const orbit = document.querySelector('.orbit');
if (orbit) {
    const links = [...orbit.querySelectorAll('.orbital-icons a')];
    const trails = [...orbit.querySelectorAll('.orbit-trail')];
    let hovered = null;
    let focused = null;
    let pressed = null;
    const indexOf = target => {
        const index = links.indexOf(target instanceof Element ? target.closest('a') : null);
        return index >= 0 ? index : null;
    };

    function illuminate() {
        const source = pressed ?? hovered ?? focused;
        // Read all geometry before writing styles; no per-frame event loop.
        const bounds = orbit.getBoundingClientRect();
        const centers = links.map(link => {
            const rect = link.getBoundingClientRect();
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, size: Math.max(rect.width, rect.height) };
        });
        const origin = source === null ? null : centers[source];
        if (origin) {
            orbit.dataset.lit = String(source + 1);
            orbit.style.setProperty('--source-x', `${origin.x - bounds.x}px`);
            orbit.style.setProperty('--source-y', `${origin.y - bounds.y}px`);
        } else {
            delete orbit.dataset.lit;
        }
        const light = centers.map((center, index) => {
            if (!origin) return 0;
            if (index === source) return 1;
            const distance = Math.hypot(center.x - origin.x, center.y - origin.y);
            const radius = Math.max(bounds.width, bounds.height) * 0.6;
            return 0.02 + 0.16 * Math.exp(-distance * distance / (radius * radius));
        });
        links.forEach((link, index) => {
            const center = centers[index];
            const distance = origin ? Math.hypot(origin.x - center.x, origin.y - center.y) : 0;
            link.style.setProperty('--illumination', light[index].toFixed(4));
            link.style.setProperty('--rim-x', `${distance ? (origin.x - center.x) / distance * 2 : 0}px`);
            link.style.setProperty('--rim-y', `${distance ? (origin.y - center.y) / distance * 2 : 0}px`);
        });
        trails.forEach((trail, index) => {
            const a = centers[index], b = centers[(index + 1) % links.length];
            const distance = Math.hypot(b.x - a.x, b.y - a.y);
            // Use screen geometry so cylinders keep a circular cross-section
            // even when the hexagon flattens on a short landscape screen.
            const clearance = (a.size + b.size) / 2 + 24;
            trail.style.setProperty('--connector-x', `${(a.x + b.x) / 2 - bounds.x}px`);
            trail.style.setProperty('--connector-y', `${(a.y + b.y) / 2 - bounds.y}px`);
            trail.style.setProperty('--connector-angle', `${Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI}deg`);
            trail.style.setProperty('--connector-length', `${Math.max(0, distance - clearance)}px`);
            trail.style.setProperty('--trail-light', (Math.max(light[index], light[(index + 1) % links.length]) * 0.35).toFixed(4));
        });
    }

    orbit.addEventListener('pointerover', event => {
        if (event.pointerType !== 'mouse') return;
        hovered = indexOf(event.target);
        illuminate();
    }, { passive: true });
    orbit.addEventListener('pointerout', event => {
        if (event.pointerType !== 'mouse') return;
        hovered = indexOf(event.relatedTarget);
        illuminate();
    }, { passive: true });
    orbit.addEventListener('focusin', event => {
        focused = event.target.matches(':focus-visible') ? indexOf(event.target) : null;
        illuminate();
    });
    orbit.addEventListener('focusout', event => {
        focused = event.relatedTarget instanceof Element && event.relatedTarget.matches(':focus-visible')
            ? indexOf(event.relatedTarget) : null;
        illuminate();
    });
    orbit.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse') return;
        pressed = indexOf(event.target);
        illuminate();
    }, { passive: true });
    const release = () => { pressed = null; illuminate(); };
    const clear = () => { hovered = focused = pressed = null; illuminate(); };
    window.addEventListener('pointerup', release, { passive: true });
    window.addEventListener('pointercancel', release, { passive: true });
    window.addEventListener('blur', clear);
    window.addEventListener('resize', illuminate, { passive: true });
    const layoutObserver = new ResizeObserver(illuminate);
    layoutObserver.observe(orbit);
    window.addEventListener('beforeunload', () => layoutObserver.disconnect(), { once: true });
    document.documentElement.addEventListener('pointerleave', () => {
        hovered = pressed = null;
        illuminate();
    }, { passive: true });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) clear();
    });
}
