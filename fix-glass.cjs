const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        if (file === 'node_modules') return;
        file = dir + '/' + file;
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.tsx')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk('.');
files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    const regex = /glass-panel(?!\s+border\s+border-white\/10\s+shadow-\[inset_0_1px_0_rgba\(255,255,255,0\.05\)\])/g;
    if (regex.test(content)) {
        content = content.replace(regex, 'glass-panel border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]');
        fs.writeFileSync(file, content);
        console.log("Fixed", file);
    }
});
