#!/usr/bin/env python3
"""Concatenate the modules into one standalone HTML file."""
import glob, os, re, sys
root = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(root, 'src')
js = ''.join(open(f, encoding='utf-8').read() + '\n' for f in sorted(glob.glob(os.path.join(src, 'js', '*.js'))))
css = open(os.path.join(src, 'style.css'), encoding='utf-8').read()
body = open(os.path.join(src, 'body.html'), encoding='utf-8').read()
html = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Orbital Dominion — Real-Time Strategy</title>
<style>
{css}
</style>
</head>
<body>
{body}
<script>
(function(){{
{js}
}})();
</script>
</body>
</html>
'''
out = os.path.join(root, 'dist', 'orbital_dominion_v2.html')
os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, 'w', encoding='utf-8').write(html)
print('wrote', out, len(html), 'bytes')
