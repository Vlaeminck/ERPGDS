import re

with open('static/js/main.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Replace typical Chart.js dark theme colors with light theme ones
js = js.replace("color: '#94a3b8'", "color: '#64748b'")
js = js.replace("color: '#f8fafc'", "color: '#1e293b'")
js = js.replace("color: 'rgba(255, 255, 255, 0.1)'", "color: 'rgba(0, 0, 0, 0.1)'")
js = js.replace("color: 'rgba(255, 255, 255, 0.2)'", "color: 'rgba(0, 0, 0, 0.1)'")
js = js.replace("color: 'white'", "color: '#1e293b'")

with open('static/js/main.js', 'w', encoding='utf-8') as f:
    f.write(js)
print('Chart colors updated.')
