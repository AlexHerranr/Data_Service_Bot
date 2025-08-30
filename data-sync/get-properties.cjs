// Simple script to get properties from Beds24 and show the mapping
const axios = require('axios');
require('dotenv').config({ path: '../.env' });

async function getProperties() {
  try {
    // Get token first
    const tokenResponse = await axios.post('https://beds24.com/api/v2/authentication/token', {
      refreshToken: process.env.BEDS24_REFRESH_TOKEN
    });
    
    const token = tokenResponse.data.token;
    console.log('✅ Got token');
    
    // Get properties
    const propertiesResponse = await axios.get('https://beds24.com/api/v2/properties', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const properties = propertiesResponse.data.data || [];
    console.log(`\n📋 Found ${properties.length} properties:\n`);
    
    // Create mapping code
    const mapping = {};
    
    for (const prop of properties) {
      if (prop.id && prop.name) {
        mapping[prop.id] = prop.name;
        console.log(`Property ${prop.id}: ${prop.name}`);
        
        // Also check for rooms
        if (prop.rooms && Array.isArray(prop.rooms)) {
          for (const room of prop.rooms) {
            if (room.id && room.name) {
              mapping[room.id] = `${prop.name} - ${room.name}`;
              console.log(`  Room ${room.id}: ${room.name}`);
            }
          }
        }
      }
    }
    
    // Generate TypeScript code
    console.log('\n📝 Generated mapping code:\n');
    console.log('const propertyMap: Record<string, string> = {');
    
    for (const [id, name] of Object.entries(mapping)) {
      console.log(`    '${id}': '${name.replace(/'/g, "\\'").replace(/"/g, '\\"')}',`);
    }
    
    console.log('  };');
    
    return mapping;
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

getProperties();