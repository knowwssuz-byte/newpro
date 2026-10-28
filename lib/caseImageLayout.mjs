// Reusable values shared by the admin preview, Case card and Case detail.
export function caseImageValues(row = {}) {
  const zoom = Number(row.image_scale), horizontal = Number(row.image_offset_x), vertical = Number(row.image_offset_y);
  return {
    scale: Number.isFinite(zoom) && zoom >= .65 && zoom <= 2.5 ? zoom : 1,
    x: Number.isFinite(horizontal) && horizontal >= -50 && horizontal <= 50 ? horizontal : 0,
    y: Number.isFinite(vertical) && vertical >= -50 && vertical <= 50 ? vertical : 0,
  };
}
export function caseImageStyle(row = {}) {
  const { scale,x,y } = caseImageValues(row);
  return {'--case-image-scale':String(scale),'--case-image-x':x+'%','--case-image-y':y+'%'};
}
