document.getElementById('analyzeBtn').addEventListener('click', async () => {
  const resultDiv = document.getElementById('result');
  const btn = document.getElementById('analyzeBtn');
  
  btn.disabled = true;
  btn.innerText = "Analyzing page...";
  resultDiv.innerHTML = "<p>Reading job description...</p>";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Inject the content script to scrape the page
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeJobData
    });

    const data = results[0].result;
    
    if (!data.title) {
      resultDiv.innerHTML = "<p style='color: #ff6b6b'>Could not find a job description on this page. Make sure you are on a LinkedIn or Indeed job posting.</p>";
      btn.disabled = false;
      btn.innerText = "Analyze Job on this Page";
      return;
    }

    resultDiv.innerHTML = `
      <div style="margin-bottom: 12px">
        <strong>${data.title}</strong><br>
        <span style="color: #aaa; font-size: 12px">${data.company}</span>
      </div>
      <p style="color: #6bcf93; margin-bottom: 8px;">✓ Job successfully parsed</p>
      ${data.applicants ? `<div class="stat"><strong>Market Intel:</strong> ${data.applicants}</div>` : ''}
      <button id="sendToSartho" style="background: #111; border: 1px solid #333; margin-top: 12px">Send to Sartho Dashboard ↗</button>
    `;

    document.getElementById('sendToSartho')?.addEventListener('click', () => {
      // Open Sartho Jobs page (ideally passing data via query params or postMessage, but simple link for prototype)
      chrome.tabs.create({ url: 'http://localhost:3000/jobs' });
    });

  } catch (err) {
    resultDiv.innerHTML = `<p style="color: #ff6b6b">Error: ${err.message}</p>`;
  } finally {
    btn.disabled = false;
    btn.innerText = "Analyze Job on this Page";
  }
});

// This function runs IN the context of the web page (LinkedIn/Indeed)
function scrapeJobData() {
  const url = window.location.href;
  let title = '';
  let company = '';
  let description = '';
  let applicants = '';

  if (url.includes('linkedin.com')) {
    const titleEl = document.querySelector('h1');
    title = titleEl ? titleEl.innerText : '';
    
    // LinkedIn specific classes change often, grabbing generic structural hints
    const companyEl = document.querySelector('.job-details-jobs-unified-top-card__company-name') || document.querySelector('a[href*="/company/"]');
    company = companyEl ? companyEl.innerText : '';
    
    const descEl = document.querySelector('.jobs-description') || document.querySelector('article');
    description = descEl ? descEl.innerText : '';
    
    const applicantEl = Array.from(document.querySelectorAll('span')).find(el => el.innerText.includes('applicant'));
    applicants = applicantEl ? applicantEl.innerText.trim() : 'Applicant data hidden by LinkedIn';
  } else {
    // Fallback naive extraction
    title = document.title;
    description = document.body.innerText.slice(0, 5000);
  }

  return { title, company, description, applicants };
}
