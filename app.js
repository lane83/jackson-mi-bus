// Load bus route data
let busRoutes = [];
let nearestStop = null; // Declare nearestStop globally

// Try to fetch routes.json using HTTP
fetch('./routes.json')
  .then(response => {
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    return response.json();
  })
  .catch(() => {
    // Fallback for local file access
    return fetch('routes.json')
      .then(response => response.text())
      .then(text => {
        try {
          return JSON.parse(text);
        } catch (e) {
          throw new Error('Invalid JSON format');
        }
      });
  })
  .then(data => {
    if (!data || !data.routes || data.routes.length === 0) {
      throw new Error('No routes found in routes.json');
    }
    busRoutes = data.routes;
    console.log('Loaded bus routes:', busRoutes);
    init();
  })
  .catch(error => {
    console.error('Error loading bus routes:', error);
    locationStatus.innerHTML = `
      <div class="error-message">Error loading bus routes</div>
      <div class="help-text">
        Please check that routes.json exists and contains valid route data.
      </div>
    `;
  });

// DOM elements
const getLocationBtn = document.getElementById('get-location');
const locationStatus = document.getElementById('location-status');
const nearestStopDiv = document.getElementById('nearest-stop');
const nextArrivalDiv = document.getElementById('next-arrival');

// Get user location
getLocationBtn.addEventListener('click', () => {
  locationStatus.textContent = 'Locating...';
  
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      position => {
        const userLocation = {
          lat: position.coords.latitude,
          long: position.coords.longitude
        };
        locationStatus.textContent = 'Location found!';
        findNearestStop(userLocation);
      },
      error => {
        let errorMessage = 'Unable to determine your location. ';
        switch(error.code) {
          case error.PERMISSION_DENIED:
            errorMessage += 'Please enable location permissions in your browser settings.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage += 'Location information is unavailable.';
            break;
          case error.TIMEOUT:
            errorMessage += 'The request to get location timed out.';
            break;
          default:
            errorMessage += 'Please try again.';
        }
        
        locationStatus.innerHTML = `
          <div class="error-message">${errorMessage}</div>
          <div class="help-text">
            ${error.code === error.POSITION_UNAVAILABLE ? 
              'Make sure location services are enabled on your device.' : 
              'Check your browser settings to ensure location access is allowed.'
            }
          </div>
          <button onclick="getLocationBtn.click()" class="retry-btn">Try Again</button>
        `;
      }
    );
  } else {
    locationStatus.innerHTML = `
      <div class="error-message">Geolocation is not supported by this browser.</div>
      <div class="help-text">Try using Chrome, Firefox, or Edge on a device with location services enabled.</div>
    `;
  }
});

// Find nearest bus stop
async function useManualLocation() {
  const input = document.getElementById('manual-location').value;
  if (!input) {
    locationStatus.textContent = 'Please enter a location';
    return;
  }

  locationStatus.textContent = 'Processing manual location...';
  
  try {
    // Use OpenStreetMap Nominatim API with alternative CORS proxy
    const response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(`https://nominatim.openstreetmap.org/search?format=json&q=${input}`)}`);
    const data = await response.json();
    
    if (data.length > 0) {
      const manualLocation = {
        lat: parseFloat(data[0].lat),
        long: parseFloat(data[0].lon)
      };
      findNearestStop(manualLocation);
    } else {
      locationStatus.innerHTML = `
        <div class="error-message">Location not found</div>
        <div class="help-text">
          Please try entering a complete address including:<br>
          - Street number and name<br>
          - City<br>
          - State (e.g., MI for Michigan)<br>
          Example: "123 Main St, Jackson, MI"
        </div>
        <button onclick="useManualLocation()" class="retry-btn">Try Again</button>
      `;
    }
  } catch (error) {
    console.error('Geocoding error:', error);
    locationStatus.textContent = 'Error processing location. Please try again.';
  }
}

// Add manual location input to the main interface
document.addEventListener('DOMContentLoaded', () => {
  const locationContainer = document.querySelector('.location-container');
  const manualLocationDiv = document.createElement('div');
  manualLocationDiv.className = 'manual-location';
  manualLocationDiv.innerHTML = `
    <p>Or enter your location manually:</p>
    <input type="text" id="manual-location" placeholder="Enter address or coordinates">
    <button onclick="useManualLocation()" class="manual-btn">Use Location</button>
  `;
  locationContainer.appendChild(manualLocationDiv);
});

// Haversine formula to calculate distance between two coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * 
    Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const km = R * c;
  return km * 0.621371; // Convert km to miles
}

function findNearestStop(userLocation) {
  let nearestStop = null;
  let minDistance = Infinity;
  let validStops = 0;
  
  busRoutes.forEach(route => {
    route.stops.forEach(stop => {
      if (stop.latitude && stop.longitude) {
        validStops++;
        const distance = calculateDistance(
          userLocation.lat,
          userLocation.long,
          stop.latitude,
          stop.longitude
        );
        
        if (distance < minDistance) {
          minDistance = distance;
          nearestStop = stop;
        }
      }
    });
  });

  if (nearestStop) {
    const distanceMiles = minDistance;
    const distanceText = distanceMiles < 1 ? 
      `${Math.round(distanceMiles * 1760)} yards away` : 
      `${distanceMiles.toFixed(2)} miles away`;
    nearestStopDiv.textContent = `${nearestStop.name} (${distanceText})`;
    calculateNextArrival(nearestStop);
  } else if (validStops === 0) {
    nearestStopDiv.innerHTML = `
      <div class="error-message">No bus stops with valid coordinates found</div>
      <div class="help-text">
        The bus stop data appears to be incomplete. Please try again later.
      </div>
    `;
  } else {
    nearestStopDiv.textContent = 'No nearby bus stops found';
  }
}

// Convert military time to AM/PM format
function militaryToAmPm(timeString) {
  const [hours, minutes] = timeString.split(':').map(Number);
  let period = 'AM';
  let displayHours = hours;
  
  if (hours >= 12) {
    period = 'PM';
    if (hours > 12) {
      displayHours = hours - 12;
    }
  }
  
  if (hours === 0) {
    displayHours = 12;
  }
  
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

// Calculate next arrival time
function calculateNextArrival(nearestStop) {
  const now = new Date();
  let nextArrival = null;
  let minMinutesUntil = Infinity;

  // Convert current time to minutes since midnight for easier comparison
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Only check the nearest stop's schedule
  if (nearestStop && nearestStop.schedule) {
    nearestStop.schedule.forEach(timeString => {
      // Parse military time string (e.g. "13:15")
      const [hours, minutes] = timeString.split(':').map(Number);
      
      // Calculate minutes since midnight
      const scheduleMinutes = hours * 60 + minutes;
      
      // Calculate minutes until arrival
      let minutesUntil = scheduleMinutes - currentMinutes;
      
      // Handle next day arrivals
      if (minutesUntil < 0) {
        minutesUntil += 1440; // Add 24 hours in minutes
      }
      
      // Track the earliest arrival
      if (minutesUntil < minMinutesUntil) {
        minMinutesUntil = minutesUntil;
        nextArrival = militaryToAmPm(timeString);
      }
    });

    if (nextArrival) {
      nextArrivalDiv.textContent = `Next bus arrives at ${nextArrival} (in ${minMinutesUntil} minutes)`;
    } else {
      nextArrivalDiv.textContent = 'No upcoming arrivals found at this stop';
    }
  } else {
    nextArrivalDiv.textContent = 'No schedule available for this stop';
  }
}

// Initialize
function init() {
  nearestStopDiv.textContent = 'Please find your location';
  nextArrivalDiv.textContent = 'Waiting for location...';
}

init();
