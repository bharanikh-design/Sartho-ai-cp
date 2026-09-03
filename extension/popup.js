let parsedData = null;
let sourceUrl = '';

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
    
    if (!data.title || !data.description || data.description.length < 50) {
      resultDiv.innerHTML = "<p style='color: #ff6b6b'>Could not extract enough job details. Make sure the job description is loaded on the screen.</p>";
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

    document.getElementById('sendToSartho').addEventListener('click', () => {
      document.getElementById('sendToSartho').innerText = "Sending...";
      chrome.runtime.sendMessage({
        type: "SEND_TO_SARTHO",
        payload: {
          title: parsedData.title,
          company: parsedData.company,
          description: parsedData.description,
          url: sourceUrl
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

  if (url.includes('linkedin.com')) {
    // LinkedIn Job Titles
    const titleEl = document.querySelector('.job-details-jobs-unified-top-card__job-title') 
                 || document.querySelector('h1') 
                 || document.querySelector('.topcard__title');
    title = titleEl ? titleEl.innerText.trim() : document.title.split(' | ')[0];
    
    // LinkedIn Company
    const companyEl = document.querySelector('.job-details-jobs-unified-top-card__company-name') 
                   || document.querySelector('a[href*="/company/"]')
                   || document.querySelector('.topcard__org-name-link');
    company = companyEl ? companyEl.innerText.trim() : '';
    
    // LinkedIn Description
    const descEl = document.getElementById('job-details') 
                || document.querySelector('.jobs-description__content') 
                || document.querySelector('.jobs-description') 
                || document.querySelector('article');
    description = descEl ? descEl.innerText.trim() : '';
    
    // LinkedIn Applicants
    const applicantEl = Array.from(document.querySelectorAll('span, li')).find(el => el.innerText.toLowerCase().includes('applicant'));
    applicants = applicantEl ? applicantEl.innerText.trim() : 'Applicant data hidden by LinkedIn';
  } else if (url.includes('indeed.com')) {
    const titleEl = document.querySelector('h1');
    title = titleEl ? titleEl.innerText.trim() : document.title.split(' - ')[0];
    const companyEl = document.querySelector('[data-testid="inlineHeader-companyName"]');
    company = companyEl ? companyEl.innerText.trim() : '';
    const descEl = document.getElementById('jobDescriptionText');
    description = descEl ? descEl.innerText.trim() : '';
  } else {
    title = document.title;
    description = document.body.innerText.slice(0, 5000);
  }

  return { title, company, description, applicants };
}
