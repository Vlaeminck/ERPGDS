import re

with open('static/css/style.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Fix .badge
css = css.replace('background: rgba(255, 255, 255, 0.08);', 'background: oklch(94% 0.014 95);')
css = css.replace('.badge {\\nbackground: oklch(94% 0.014 95);\\npadding: 0.35rem 0.7rem;\\nborder-radius: 20px;\\nfont-size: 0.8rem;\\ncolor: var(--text-secondary);', '.badge {\\nbackground: oklch(94% 0.014 95);\\npadding: 0.35rem 0.7rem;\\nborder-radius: 20px;\\nfont-size: 0.8rem;\\ncolor: var(--text-primary);\\nborder: 1px solid var(--border-color);')

# Fix table headers
css = css.replace('background: rgba(0,0,0,0.12);', 'background: oklch(98% 0.010 95); color: var(--text-primary);')
css = css.replace('background: rgba(30, 41, 59, 0.8);', 'background: oklch(98% 0.010 95); color: var(--text-primary);')

# Fix state badges text color to be darker for light theme
css = css.replace('color: #fbbf24;', 'color: #92400e;') # Darker amber
css = css.replace('color: #34d399;', 'color: #065f46;') # Darker emerald
css = css.replace('color: #60a5fa;', 'color: #1e40af;') # Darker blue

with open('static/css/style.css', 'w', encoding='utf-8') as f:
    f.write(css)

with open('templates/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Fix inline dark styles in index.html
html = html.replace('background: rgba(15, 23, 42, 0.85);', 'background: oklch(100% 0 0);')
html = html.replace('background: #0f172a;', 'background: oklch(100% 0 0);')
html = html.replace('color: #60a5fa;', 'color: var(--primary-color);') # the calendar icon

with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
print('Contrast fixes applied.')
