import { Coordinates } from '../types';

export const calculateDistance = (coord1: Coordinates, coord2: Coordinates): number => {
  const R = 6371e3; // Earth radius in meters
  const lat1 = (coord1.latitude * Math.PI) / 180;
  const lat2 = (coord2.latitude * Math.PI) / 180;
  const deltaLat = ((coord2.latitude - coord1.latitude) * Math.PI) / 180;
  const deltaLng = ((coord2.longitude - coord1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

export const getCurrentPosition = (): Promise<GeolocationPosition> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by your browser"));
    } else {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      });
    }
  });
};

export const getPublicIP = async (): Promise<string> => {
  try {
    // Primary: ipify
    const response = await fetch('https://api.ipify.org?format=json');
    if (!response.ok) throw new Error('Ipify failed');
    const data = await response.json();
    return data.ip;
  } catch (error) {
    try {
      // Fallback: ipapi
      const response = await fetch('https://ipapi.co/json/');
      if (!response.ok) throw new Error('Ipapi failed');
      const data = await response.json();
      return data.ip;
    } catch (e) {
      console.warn("Failed to fetch IP from external services. Using offline fallback.");
      return "127.0.0.1 (Offline)";
    }
  }
};