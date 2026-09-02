// Test the new Wulan Samosir account
const DASHBOARD_URL = "http://localhost:20127";
const PASSWORD = "change-me";

async function test() {
  // Login
  const loginRes = await fetch(`${DASHBOARD_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD })
  });
  
  const cookie = loginRes.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Login failed");
  
  console.log("✅ Logged in");
  
  // Test chat completion
  console.log("\n🧪 Testing qoder/lite model...");
  
  const chatRes = await fetch(`${DASHBOARD_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": cookie
    },
    body: JSON.stringify({
      model: "qoder/lite",
      messages: [{ role: "user", content: "Say 'Hello from Wulan' in exactly 3 words" }],
      max_tokens: 20,
      stream: false  // Disable streaming to get JSON response
    })
  });
  
  const text = await chatRes.text();
  
  // Try to parse as JSON
  let result;
  try {
    result = JSON.parse(text);
  } catch (e) {
    // If it's SSE format, parse the last data chunk
    const lines = text.split('\n').filter(line => line.startsWith('data: '));
    if (lines.length > 0) {
      const lastData = lines[lines.length - 1].replace('data: ', '');
      if (lastData !== '[DONE]') {
        result = JSON.parse(lastData);
      }
    } else {
      throw new Error(`Unexpected response format: ${text.slice(0, 100)}`);
    }
  }
  
  if (result.error) {
    console.log(`❌ Error: ${result.error.message}`);
  } else {
    console.log(`✅ Success!`);
    console.log(`   Model: ${result.model || 'qoder/lite'}`);
    console.log(`   Response: ${result.choices[0].message.content}`);
  }
}

test().catch(err => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
