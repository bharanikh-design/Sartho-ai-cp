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
      ${data.applicants && !data.applicants.includes('hidden') ? `<div class="stat"><strong>Market Intel:</strong> ${data.applicants}</div>` : ''}
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
        // Ultimate fallback: Look for any div containing "About the job"
        const allNodes = Array.from(document.querySelectorAll('div, section, main'));
        const aboutNode = allNodes.find(el => el.innerText && el.innerText.includes('About the job') && el.innerText.length > 500);
        if (aboutNode) {
          description = aboutNode.innerText.trim();
        } else {
          // If we are in the split view, grabbing the whole body might grab the list of jobs.
          // Grab the main content area.
          const mainNode = document.querySelector('main') || document.body;
          description = mainNode.innerText.trim();
        }
      }
      
      const applicantEl = Array.from(document.querySelectorAll('span, li')).find(el => el.innerText.toLowerCase().includes('applicant'));
      applicants = applicantEl ? applicantEl.innerText.trim() : 'hidden';
    } else if (url.includes('indeed.com')) {
      const titleEl = document.querySelector('h1');
      title = titleEl ? titleEl.innerText.trim() : document.title.split(' - ')[0];
      const companyEl = document.querySelector('[data-testid="inlineHeader-companyName"]');
      company = companyEl ? companyEl.innerText.trim() : 'Unknown Company';
      const descEl = document.getElementById('jobDescriptionText') || document.body;
      description = descEl.innerText.trim();
    } else {
      title = document.title;
      description = document.body.innerText;
    }
  } catch (e) {
    // Failsafe
    title = document.title;
    description = document.body.innerText;
  }

  return { 
    title: title || 'Unknown Title', 
    company, 
    description: description.slice(0, 15000), // Cap at 15k chars to prevent postMessage overload
    applicants 
  };
}
