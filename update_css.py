import re

with open('static/css/style.css', 'r', encoding='utf-8') as f:
    css = f.read()

# 1. Replace :root variables for the light premium theme
new_root = '''
:root {
    /* Impeccable Light Theme Tokens */
    --bg-color: oklch(99% 0.008 95);
    --sidebar-bg: oklch(98% 0.010 95);
    --card-bg: oklch(100% 0 0);
    --border-color: oklch(91% 0.012 95);
    --text-primary: oklch(18% 0.02 95);
    --text-secondary: oklch(45% 0.015 95);
    --primary-color: oklch(14% 0.018 95);
    --primary-hover: oklch(25% 0.018 95);
    --danger-color: oklch(58% 0.15 35);
    --danger-hover: oklch(52% 0.16 35);
    --success-color: oklch(45% 0.18 145);
    --warning-color: oklch(77% 0.13 82);
    --transition-speed: 0.15s;
    --border-radius: 6px;
}
'''
css = re.sub(r':root\s*\{[^}]+\}', new_root.strip(), css, count=1)

# 2. Body styles (Typography and removal of gradients)
css = css.replace("font-family: 'Inter', system-ui, -apple-system, sans-serif;", "font-family: 'Albert Sans', Avenir Next, Helvetica Neue, Arial, sans-serif;")
css = css.replace('background-image: radial-gradient(ellipse 60% 50% at 80% 20%, rgba(139, 92, 246, 0.12), transparent);', 'background-image: none;')

# 3. Sidebar
css = css.replace('backdrop-filter: blur(4px);', '')
css = css.replace('-webkit-backdrop-filter: blur(4px);', '')

# 4. Nav links
css = css.replace('background: rgba(59, 130, 246, 0.15);', 'background: oklch(94% 0.014 95);')
css = css.replace('border: 1px solid rgba(59, 130, 246, 0.2);', 'border: 1px solid oklch(91% 0.012 95);')
css = css.replace('background: rgba(255, 255, 255, 0.06);', 'background: oklch(96% 0.01 95);')

# 5. Cards (Remove dark background, rely on white space / minimal border)
css = css.replace('box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);', 'box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);')
css = css.replace('box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);', 'box-shadow: 0 1px 2px rgba(0,0,0,0.03);')
css = css.replace('background: rgba(30, 41, 59, 0.85);', 'background: var(--card-bg);')
css = css.replace('backdrop-filter: blur(10px);', '')
css = css.replace('-webkit-backdrop-filter: blur(10px);', '')

# 6. Tables
css = css.replace('background: rgba(255, 255, 255, 0.02);', 'background: oklch(97% 0.012 95);')
css = css.replace('background: rgba(255, 255, 255, 0.05);', 'background: oklch(94% 0.014 95);')
css = css.replace('border-bottom: 1px solid rgba(255, 255, 255, 0.1);', 'border-bottom: 1px solid var(--border-color);')

# 7. Inputs
css = css.replace('background: rgba(15, 23, 42, 0.6);', 'background: oklch(100% 0 0);')
css = css.replace('border: 1px solid rgba(255, 255, 255, 0.2);', 'border: 1px solid var(--border-color);')
css = css.replace('color: white;', 'color: var(--text-primary);')
css = css.replace('color: #fff;', 'color: var(--text-primary);')

# 8. Modal
css = css.replace('background: #1e293b;', 'background: oklch(100% 0 0);')
css = css.replace('box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.3);', 'box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);')

# Replace inline light colors (white backgrounds replacing dark tones)
# Buttons
css = css.replace('color: white;', 'color: var(--text-primary);')
css = css.replace('color: #ffffff;', 'color: var(--text-primary);')

# Button secondary
css = css.replace('background: rgba(255, 255, 255, 0.1);', 'background: oklch(94% 0.014 95);')
css = css.replace('background: rgba(255, 255, 255, 0.2);', 'background: oklch(91% 0.012 95);')

with open('static/css/style.css', 'w', encoding='utf-8') as f:
    f.write(css)
print('CSS rewrite completed.')
