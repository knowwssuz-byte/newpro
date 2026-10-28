// Single artwork across all Case Stars/balance prizes.
export const CASE_STARS_ARTWORK_KEY='case_stars_reward_artwork';
export async function getSharedStarsArtworkUrl(supabase) {
 const {data,error}=await supabase.from('app_settings').select('value')
  .eq('key',CASE_STARS_ARTWORK_KEY).maybeSingle();
 if(error)throw error;
 return typeof data?.value?.image_url==='string'?data.value.image_url:'';
}
export async function setSharedStarsArtworkUrl(supabase,imageUrl) {
 if(!imageUrl||typeof imageUrl!=='string')throw new Error('Stars rasmi mavjud emas.');
 const {error:settingError}=await supabase.from('app_settings').upsert({
   key:CASE_STARS_ARTWORK_KEY,value:{image_url:imageUrl,updated_at:new Date().toISOString()}
 },{onConflict:'key'});
 if(settingError)throw settingError;
 // Only case balance gifts, including ones used by old history, are changed.
 const {data,error}=await supabase.from('gifts').update({image_url:imageUrl})
   .eq('type','balance').not('case_id','is',null).select('id');
 if(error)throw error;
 return {imageUrl,updatedCount:(data||[]).length};
}
