const q=require('fs'),w=require('cloudinary').v2;
const x=['✅ flagsMap.json and flagsUrls.json created successfully.','❌ Error:'];
w.config({cloud_name:'-----c0k_miskasa_private_',api_key:'-----c0k_miskasa_private_',api_secret:'-----c0k_miskasa_private_'});
(async()=>{
  let e=null,r={},t={};
  try{
    do{
      const y=await w.api.resources({max_results:500,next_cursor:e,type:'private',resource_type:'image'});
      for(const z of y.resources){
        const A=z.public_id,B=z.secure_url,C=A.match(/^([A-Z]{2})_/);
        if(C){
          const D=C[1];
          r[D]=A;t[D]=B;
        }
      }
      e=y.next_cursor;
    }while(e);
    q.writeFileSync('flagsMap.json',JSON.stringify(r,null,2));
    q.writeFileSync('flagsUrls.json',JSON.stringify(t,null,2));
    console.log(x[0]);
  }catch(F){
    console.error(x[1],F.message);
  }
})();
