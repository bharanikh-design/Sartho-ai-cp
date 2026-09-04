// Sartho Auto-Applier Engine
// Injects profile data into common ATS forms (Greenhouse, Lever, Workday)

function autofillForm(profileData) {
  if (!profileData) {
    console.error("Sartho: No profile data provided for autofill.");
    return;
  }

  console.log("Sartho: Starting autofill with data:", profileData);

  const fieldMappings = {
    firstName: ['first_name', 'firstname', 'given-name', 'fname'],
    lastName: ['last_name', 'lastname', 'family-name', 'lname'],
    email: ['email', 'emailaddress'],
    phone: ['phone', 'phonenumber', 'tel'],
    linkedin: ['linkedin', 'urls[LinkedIn]', 'urls.LinkedIn'],
    portfolio: ['portfolio', 'website', 'urls[Portfolio]']
  };

  const simulateTyping = (element, value) => {
    if (!element || !value) return;
    
    // Set value directly
    element.value = value;
    
    // Dispatch events to trigger React/Angular state updates
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  };

  const inputs = document.querySelectorAll('input, textarea');
  
  inputs.forEach(input => {
    const name = (input.name || '').toLowerCase();
    const id = (input.id || '').toLowerCase();
    const autocomplete = (input.getAttribute('autocomplete') || '').toLowerCase();
    
    const matches = (keywords) => keywords.some(kw => name.includes(kw) || id.includes(kw) || autocomplete.includes(kw));

    if (matches(fieldMappings.firstName)) simulateTyping(input, profileData.firstName);
    else if (matches(fieldMappings.lastName)) simulateTyping(input, profileData.lastName);
    else if (matches(fieldMappings.email)) simulateTyping(input, profileData.email);
    else if (matches(fieldMappings.phone)) simulateTyping(input, profileData.phone);
    else if (matches(fieldMappings.linkedin)) simulateTyping(input, profileData.linkedinUrl);
    else if (matches(fieldMappings.portfolio)) simulateTyping(input, profileData.portfolioUrl);
  });

  // Handle Greenhouse specific custom questions (e.g. "LinkedIn Profile")
  const labels = document.querySelectorAll('label');
  labels.forEach(label => {
    const text = label.innerText.toLowerCase();
    const input = label.querySelector('input') || document.getElementById(label.getAttribute('for'));
    if (!input) return;

    if (text.includes('linkedin')) simulateTyping(input, profileData.linkedinUrl);
    else if (text.includes('website') || text.includes('portfolio')) simulateTyping(input, profileData.portfolioUrl);
  });

  alert("Sartho AI: Application fields auto-filled!");
}

// If injected via scripting.executeScript, we can run it immediately if data is passed via args, 
// or listen for a message.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "EXECUTE_AUTOFILL") {
    autofillForm(message.payload);
    sendResponse({ success: true });
  }
});
