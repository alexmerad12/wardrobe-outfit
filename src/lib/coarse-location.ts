// The app only needs the weather of the area someone is in, never where
// exactly they are. One decimal of a degree is about 11 km north to south
// (and 5 to 8 km east to west at the latitudes people live at), well above
// the 3 km² that Google Play's Data safety form calls "approximate
// location". Every position the browser gives goes through here before it
// is used, cached, sent to our own API or to the reverse geocoder: until
// 2026-11-09 the weather call put the full GPS position in its URL.
export function coarsen(degrees: number): number {
  return Math.round(degrees * 10) / 10;
}

export function coarseCoords(coords: { latitude: number; longitude: number }): { lat: number; lng: number } {
  return { lat: coarsen(coords.latitude), lng: coarsen(coords.longitude) };
}
