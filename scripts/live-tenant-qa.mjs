import { createClient } from "@supabase/supabase-js";

const required = ["SUPABASE_ACCESS_TOKEN","NEXT_PUBLIC_SUPABASE_URL","QA_OWNER_EMAIL","QA_OWNER_PASSWORD","QA_SECOND_EMAIL","QA_SECOND_PASSWORD"];
for (const name of required) if (!process.env[name]) throw new Error(`Missing ${name}`);
const publicKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if(!publicKey)throw new Error("Missing Supabase public key");
const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const headers = { Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type":"application/json" };
const keyResponse = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys`,{headers});
if(!keyResponse.ok)throw new Error(`Unable to obtain QA administration key (${keyResponse.status})`);
const keys=await keyResponse.json();const serviceKey=keys.find(x=>x.name==="service_role")?.api_key;
if(!serviceKey)throw new Error("Service role key not available");
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,anon=publicKey;
const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const client=()=>createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
const owner=client(),second=client();
const results=[];const pass=(name,detail)=>results.push({name,status:"PASS",detail});
const SECOND_QA_USER_NAME="Neema Msuya";
const SECOND_QA_ORGANIZATION_NAME="Mwangaza Mining QA";
const SECOND_QA_SITE_NAME="Mwangaza Isolated Site";

async function signIn(target,email,password){const {error}=await target.auth.signInWithPassword({email,password});if(error)throw new Error(`Sign-in failed for ${email}: ${error.message}`)}
await signIn(owner,process.env.QA_OWNER_EMAIL,process.env.QA_OWNER_PASSWORD);
let {data:secondUsers,error:listError}=await admin.auth.admin.listUsers({page:1,perPage:1000});if(listError)throw listError;
let secondUser=secondUsers.users.find(u=>u.email===process.env.QA_SECOND_EMAIL);
if(!secondUser){const {data,error}=await admin.auth.admin.createUser({email:process.env.QA_SECOND_EMAIL,password:process.env.QA_SECOND_PASSWORD,email_confirm:true,user_metadata:{full_name:SECOND_QA_USER_NAME}});if(error)throw error;secondUser=data.user;pass("Second restricted user","created isolated QA identity")}else{const {data,error}=await admin.auth.admin.updateUserById(secondUser.id,{user_metadata:{...secondUser.user_metadata,full_name:SECOND_QA_USER_NAME}});if(error)throw error;secondUser=data.user;pass("Second restricted user","reused and normalized isolated QA identity")}
await signIn(second,process.env.QA_SECOND_EMAIL,process.env.QA_SECOND_PASSWORD);

async function scope(target){const {data,error}=await target.from("organization_memberships").select("organization_id,organizations(name),roles(code)").eq("status","active").limit(1).maybeSingle();if(error)throw error;return data}
let secondScope=await scope(second);if(!secondScope){const {error}=await second.rpc("create_organization_with_owner",{organization_name:SECOND_QA_ORGANIZATION_NAME,initial_site_name:SECOND_QA_SITE_NAME,initial_site_country:"TZ"});if(error)throw error;secondScope=await scope(second);pass("Second tenant","created isolated organization and site")}else pass("Second tenant","reused isolated organization");
const ownerScope=await scope(owner);if(!ownerScope||!secondScope)throw new Error("QA tenant scope missing");
if(ownerScope.organization_id===secondScope.organization_id)throw new Error("QA identities unexpectedly share a tenant");
const ownerOrg=ownerScope.organization_id,secondOrg=secondScope.organization_id;
const {data:{user:ownerUser}}=await owner.auth.getUser();if(!ownerUser)throw new Error("Owner session user missing");
const [{data:ownerSites,error:ownerSitesError},{data:secondSites,error:secondSitesError}]=await Promise.all([owner.from("mine_sites").select("id,organization_id").eq("organization_id",ownerOrg).limit(1),second.from("mine_sites").select("id,organization_id").eq("organization_id",secondOrg).limit(1)]);if(ownerSitesError||secondSitesError)throw ownerSitesError||secondSitesError;
const ownerSite=ownerSites[0]?.id,secondSite=secondSites[0]?.id;if(!ownerSite||!secondSite)throw new Error("QA site missing");
const [{error:profileNameError},{error:organizationNameError},{error:siteNameError}]=await Promise.all([admin.from("profiles").update({full_name:SECOND_QA_USER_NAME}).eq("id",secondUser.id),admin.from("organizations").update({name:SECOND_QA_ORGANIZATION_NAME}).eq("id",secondOrg),admin.from("mine_sites").update({name:SECOND_QA_SITE_NAME}).eq("id",secondSite)]);if(profileNameError||organizationNameError||siteNameError)throw profileNameError||organizationNameError||siteNameError;pass("QA display names","normalized user, organization, and site names");

const [{data:aSeesB,error:aError},{data:bSeesA,error:bError}]=await Promise.all([owner.from("mine_sites").select("id").eq("organization_id",secondOrg),second.from("mine_sites").select("id").eq("organization_id",ownerOrg)]);if(aError||bError)throw aError||bError;if(aSeesB.length||bSeesA.length)throw new Error("Cross-tenant read leaked rows");pass("Bidirectional cross-tenant RLS","both explicit foreign-tenant reads returned zero rows");
const {error:foreignWriteError}=await second.from("site_forecast_assumptions").insert({organization_id:ownerOrg,mine_site_id:ownerSite,commodity:"RLS QA",currency_code:"USD",price_per_ounce:1,recovery_percent:1,forecast_days:1,effective_on:new Date().toISOString().slice(0,10),created_by:secondUser.id,updated_by:secondUser.id});if(!foreignWriteError)throw new Error("Cross-tenant write unexpectedly succeeded");pass("Cross-tenant write RLS","foreign organization/site insert was rejected");

const today=new Date().toISOString().slice(0,10);const {data:assumption,error:assumptionReadError}=await owner.from("site_forecast_assumptions").select("id").eq("organization_id",ownerOrg).eq("mine_site_id",ownerSite).limit(1).maybeSingle();if(assumptionReadError)throw assumptionReadError;if(!assumption){const {error}=await owner.from("site_forecast_assumptions").insert({organization_id:ownerOrg,mine_site_id:ownerSite,commodity:"Gold",currency_code:"USD",price_per_ounce:2500,recovery_percent:85,forecast_days:30,effective_on:today,notes:"Demo assumption only — not a live market price",created_by:ownerUser.id,updated_by:ownerUser.id});if(error)throw error;pass("Forecast assumptions","created explicit demo price and recovery assumptions")}else pass("Forecast assumptions","reused existing site assumptions");
const [{data:forecast,error:forecastError},{data:summary,error:summaryError}]=await Promise.all([owner.rpc("site_cashflow_forecast",{requested_site_id:ownerSite,history_from:new Date(Date.now()-29*86400000).toISOString().slice(0,10),history_to:today}),owner.rpc("site_daily_summary",{requested_site_id:ownerSite,requested_date:today})]);if(forecastError||summaryError)throw forecastError||summaryError;if(!forecast?.length)throw new Error("Forecast RPC returned no scenario after assumptions were added");if(!Array.isArray(summary?.evidence))throw new Error("Daily summary did not include its evidence sources");pass("Forecast and daily summary RPCs",`${forecast.length} scenario(s); evidence sources returned`);

const {data:equipment,error:equipmentError}=await owner.from("equipment").select("id,current_meter").eq("organization_id",ownerOrg).eq("mine_site_id",ownerSite).is("deleted_at",null).not("current_meter","is",null).limit(1).maybeSingle();if(equipmentError)throw equipmentError;
if(equipment){const base=Number(equipment.current_meter),low=Number((base+.01).toFixed(2)),high=Number((base+.02).toFixed(2));const writes=await Promise.all([owner.rpc("record_equipment_meter_reading",{requested_equipment_id:equipment.id,reading:high,reading_notes:"Concurrent QA high"}),owner.rpc("record_equipment_meter_reading",{requested_equipment_id:equipment.id,reading:low,reading_notes:"Concurrent QA low"})]);const {data:after,error:afterError}=await owner.from("equipment").select("current_meter").eq("id",equipment.id).single();if(afterError)throw afterError;if(Number(after.current_meter)!==high)throw new Error(`Concurrent meter mismatch: base=${base}, low=${low}, high=${high}, final=${after.current_meter}, outcomes=${writes.map(x=>x.error?.code||"ok").join(",")}`);if(writes.every(x=>x.error))throw new Error("Both concurrent writes failed");pass("Concurrent write serialization",`${writes.filter(x=>!x.error).length} write(s) accepted; final meter preserved monotonic maximum`)}else pass("Concurrent write serialization","SKIP: owner tenant has no metered equipment");

const {data:file,error:fileError}=await owner.from("geological_files").select("document_path").eq("organization_id",ownerOrg).eq("mine_site_id",ownerSite).limit(1).maybeSingle();if(fileError)throw fileError;if(file){const {data:signed,error:signedError}=await owner.storage.from("documents").createSignedUrl(file.document_path,60);if(signedError)throw signedError;const download=await fetch(signed.signedUrl,{redirect:"follow"});if(!download.ok)throw new Error(`Signed download returned ${download.status}`);const body=await download.arrayBuffer();if(!body.byteLength)throw new Error("Signed download was empty");pass("Signed private download",`HTTP ${download.status}; ${body.byteLength} bytes fetched outside browser`)}else pass("Signed private download","SKIP: no geological file exists in owner tenant");

await Promise.all([owner.auth.signOut(),second.auth.signOut()]);
console.log(JSON.stringify({project:projectRef,results},null,2));
