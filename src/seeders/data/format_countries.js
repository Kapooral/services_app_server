const path = require('path')
const fs = require('fs')

const countriesJsonPath = path.join(__dirname, 'countries.json');

try {
    const new_data = []
    const countriesData = JSON.parse(fs.readFileSync(countriesJsonPath, { encoding: 'utf-8', flag: 'r'}));
    for (const [key, value] of Object.entries(countriesData)) {
        new_data.push({ code: key, name: value })
    }
    fs.writeFileSync(countriesJsonPath, JSON.stringify(new_data));
} catch(e) {
    console.error(e);
}