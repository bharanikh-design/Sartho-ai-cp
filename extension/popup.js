let parsedData = null;

let parsedData = null;
let sourceUrl = '';
let isAtsPage = false;

// Check if we are on an ATS page when the popup opens
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const url = tabs[0].url || "";
  if (url.includes('greenhouse.io') || url.includes('lever.co') || url.includes('workday.com') || url.includes('myworkdayjobs.com')) {
    isAtsPage = true;
    document.getElementById('analyzeBtn').style.display = 'none';
    
    const atsContainer = document.createElement('div');
    atsContainer.innerHTML = `
      <div style="padding: 12px; background: rgba(107, 207, 147, 0.1); border: 1px solid rgba(107, 207, 147, 0.2); border-radius: 8px; margin-bottom: 12px;">
        <h4 style="margin: 0 0 4px 0; color: #6bcf93; font-size: 13px;">ATS Detected</h4>
        <p style="margin: 0; font-size: 11px; color: #ccc;">Sartho can auto-fill this application using your Career Profile.</p>
      </div>
      <button id="autofillBtn" style="background: #174b3a; border: 1px solid #6bcf93; color: white; font-weight: bold;">Auto-fill Application ✦</button>
    `;
    document.getElementById('result').appendChild(atsContainer);

    document.getElementById('autofillBtn').addEventListener('click', async () => {
      document.getElementById('autofillBtn').innerText = "Filling...";
      
      // Tell background script to get profile from Sartho and inject autofill
      chrome.runtime.sendMessage({ type: "TRIGGER_AUTOFILL", tabId: tabs[0].id }, (response) => {
        if (response && response.success) {
          document.getElementById('autofillBtn').innerText = "✓ Filled";
          document.getElementById('autofillBtn').style.background = "#0d402b";
        } else {
          document.getElementById('autofillBtn').innerText = "Error (Ensure Sartho is open)";
          document.getElementById('autofillBtn').style.background = "#ff6b6b";
        }
      });
    });
  }
});


document.getElementById('analyzeBtn').addEventListener('click', async () => {
  const resultDiv = document.getElementById('result');
  const btn = document.getElementById('analyzeBtn');
  
  btn.disabled = true;
  btn.innerText = "Analyzing page...";
  resultDiv.innerHTML = "<p>Reading job description...</p>";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    sourceUrl = tab.url;
    
    // Inject the content script to scrape the page
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeJobData
    });

    const data = results[0].result;
    parsedData = data;
    
    // Check if we got anything usable at all
    if (!data.title || !data.description || data.description.length < 50) {
      resultDiv.innerHTML = `
        <p style='color: #ff6b6b; font-weight: bold;'>Scraping failed.</p>
        <p style='font-size: 12px; color: #ccc;'>We found title: "${data.title}" but the description was too short (${data.description?.length} chars).</p>
        <p style='font-size: 12px; color: #ccc;'>LinkedIn may have changed their layout. Please click inside the job description box to ensure it is loaded.</p>
      `;
      btn.disabled = false;
      btn.innerText = "Analyze Job on this Page";
      return;
    }

    resultDiv.innerHTML = `
      <div style="margin-bottom: 12px">
        <strong>${data.title}</strong><br>
        <span style="color: #aaa; font-size: 12px">${data.company}</span>
      </div>
      <p style="color: #6bcf93; margin-bottom: 8px;">✓ Job successfully parsed (${data.description.length} chars)</p>
      ${data.applicants && !data.applicants.includes('hidden') ? `<div class="stat" style="font-size: 11px; margin-bottom: 4px;"><strong>👥 Applicants:</strong> ${data.applicants}</div>` : ''}
      ${data.postedDate ? `<div class="stat" style="font-size: 11px; margin-bottom: 4px;"><strong>🗓 Posted:</strong> ${data.postedDate}</div>` : ''}
      ${data.hiringManager ? `<div class="stat" style="font-size: 11px; margin-bottom: 4px;"><strong>👤 Hiring Manager:</strong> ${data.hiringManager}</div>` : ''}
      <button id="sendToSartho" style="background: #111; border: 1px solid #333; margin-top: 12px; color: #6bcf93;">Send to Sartho Dashboard ↗</button>
    `;

    document.getElementById('sendToSartho').addEventListener('click', () => {
      document.getElementById('sendToSartho').innerText = "Sending...";
      chrome.runtime.sendMessage({
        type: "SEND_TO_SARTHO",
        payload: {
          title: parsedData.title,
          company: parsedData.company,
          description: parsedData.description,
          url: sourceUrl,
          applicants: parsedData.applicants,
          postedDate: parsedData.postedDate,
          hiringManager: parsedData.hiringManager
        }
      }, () => {
        window.close();
      });
    });

  } catch (err) {
    resultDiv.innerHTML = `<p style="color: #ff6b6b">Error: ${err.message}</p>`;
  } finally {
    btn.disabled = false;
    btn.innerText = "Analyze Job on this Page";
  }
});

function scrapeJobData() {
  const url = window.location.href;
  let title = '';
  let company = '';
  let description = '';
  let applicants = '';
  let postedDate = '';
  let hiringManager = '';

  try {
    if (url.includes('linkedin.com')) {
      const titleEl = document.querySelector('.job-details-jobs-unified-top-card__job-title') 
                   || document.querySelector('h1') 
                   || document.querySelector('.topcard__title');
      title = titleEl ? titleEl.innerText.trim() : document.title.split(' | ')[0];
      
      const companyEl = document.querySelector('.job-details-jobs-unified-top-card__company-name') 
                     || document.querySelector('a[href*="/company/"]')
                     || document.querySelector('.topcard__org-name-link');
      company = companyEl ? companyEl.innerText.trim() : 'Unknown Company';
      
      // Look for the specific job description container
      let descEl = document.getElementById('job-details') 
                || document.querySelector('.jobs-description__content') 
                || document.querySelector('.jobs-description') 
                || document.querySelector('article')
                || document.querySelector('.job-view-layout');
      
      if (descEl) {
        description = descEl.innerText.trim();
      } else {
        // Ultimate fallback
        const mainNode = document.querySelector('main') || document.body;
        description = mainNode.innerText.trim();
      }
      
      // Applicants
      const applicantEl = Array.from(document.querySelectorAll('span, li')).find(el => el.innerText.toLowerCase().includes('applicant'));
      if (applicantEl) applicants = applicantEl.innerText.trim();
      
      // Posted Date
      const postedEl = Array.from(document.querySelectorAll('span, li')).find(el => {
        const text = el.innerText.toLowerCase();
        return text.includes('ago') || text.includes('posted');
      });
      if (postedEl) postedDate = postedEl.innerText.trim();
      
      // Hiring Manager
      const hmEl = document.querySelector('.hirer-card__hirer-information span:first-child')
                || document.querySelector('.jobs-poster__name')
                || document.querySelector('.job-details-jobs-unified-top-card__hirer-name');
      if (hmEl) hiringManager = hmEl.innerText.trim();
      else {
        // Look for the "Meet the hiring team" block
        const profileLink = document.querySelector('a[href*="/in/"] h3') || document.querySelector('.app-aware-link:has(strong)');
        if (profileLink) hiringManager = profileLink.innerText.trim();
      }
      
    } else if (url.includes('indeed.com')) {
      const titleEl = document.querySelector('h1');
      title = titleEl ? titleEl.innerText.trim() : document.title.split(' - ')[0];
      const companyEl = document.querySelector('[data-testid="inlineHeader-companyName"]');
      company = companyEl ? companyEl.innerText.trim() : 'Unknown Company';
      const descEl = document.getElementById('jobDescriptionText') || document.body;
      description = descEl.innerText.trim();
      // Indeed meta
      const postedEl = document.querySelector('[data-testid="jobSearch-jobMetadata-posted"]');
      if (postedEl) postedDate = postedEl.innerText.trim();
    } else {
      title = document.title;
      description = document.body.innerText;
    }
  } catch (e) {
    title = document.title;
    description = document.body.innerText;
  }

  return { 
    title: title || 'Unknown Title', 
    company, 
    description: description.slice(0, 15000), 
    applicants,
    postedDate,
    hiringManager
  };
}
