import fetch from 'node-fetch';

async function main() {
  try {
    const res = await fetch('http://localhost:5000/api/health-check'); // or some public endpoint
    console.log('Server status code:', res.status);
  } catch (err) {
    console.error('Server is not running on port 5000:', err.message);
  }
}

main();
