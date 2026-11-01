import type { Context, MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from './types';
import type { Client, Role } from '@briochett/contracts';
export const now=()=>new Date().toISOString();
export const uid=()=>crypto.randomUUID();
export function fail(status:400|401|403|404|409|422|429|503,code:string,message:string,details?:unknown):never{throw new HTTPException(status,{res:Response.json({error:{code,message,...(details?{details}:{})}},{status})});}
export async function body<S extends z.ZodType>(c:Context<AppEnv>,schema:S):Promise<z.output<S>>{let raw:unknown;try{raw=await c.req.json();}catch{fail(400,'INVALID_JSON','La solicitud no contiene JSON válido.');}const result=schema.safeParse(raw);if(!result.success)fail(422,'VALIDATION','Revisa los datos del formulario.',result.error.flatten());return result.data;}
export const allow=(...roles:Role[]):MiddlewareHandler<AppEnv>=>async(c,next)=>{if(!roles.includes(c.get('user').role))fail(403,'FORBIDDEN','No tienes permiso para esta acción.');await next();};
export const viewRoles:Role[]=['administracion','vendedor','supervision'];
export const adminOnly=allow('administracion');
export const salesOnly=allow('administracion','vendedor');
export function audit(c:Context<AppEnv>,action:string,entity:string,id:string,details:unknown={}){return c.env.DB.prepare('INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,details_json,created_at) VALUES(?,?,?,?,?,?,?)').bind(uid(),c.get('user').id,action,entity,id,JSON.stringify(details),now());}
export async function hash(data:unknown){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(typeof data==='string'?data:JSON.stringify(data)));return Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');}
export async function tokenEquals(a:string,b:string){const [aHash,bHash]=await Promise.all([hash(a),hash(b)]);let diff=0;for(let i=0;i<aHash.length;i++)diff|=aHash.charCodeAt(i)^bHash.charCodeAt(i);return diff===0;}
export function pagination(c:Context<AppEnv>){const raw=Number(c.req.query('page')||1);if(!Number.isSafeInteger(raw)||raw<1||raw>100000)fail(422,'PAGE','La página no es válida.');return{page:raw,pageSize:20,offset:(raw-1)*20};}
export function clientRow(r:any):Client{return{id:r.id,code:r.code,name:r.name,rif:r.rif,contact:r.contact,phone:r.phone,address:r.address,zone:r.zone,sellerId:r.seller_id,sellerName:r.sellerName||null,active:!!r.active,geo:r.geo_json?JSON.parse(r.geo_json):null,geoUpdatedBy:r.geo_updated_by,slots:JSON.parse(r.slots_json),recurrence:r.recurrence,recurrenceStart:r.recurrence_start,updatedAt:r.updated_at};}
export async function getClient(c:Context<AppEnv>,id:string,active=false){const r=await c.env.DB.prepare('SELECT c.*,u.name sellerName FROM clients c LEFT JOIN user u ON u.id=c.seller_id WHERE c.id=?').bind(id).first<any>();const u=c.get('user');if(!r||u.role==='vendedor'&&(r.seller_id!==u.id||!r.active))fail(404,'CLIENT_NOT_FOUND','No se encontró el cliente en tu alcance.');if(active&&!r.active)fail(409,'CLIENT_INACTIVE','El cliente está desactivado.');return clientRow(r);}
export async function requireSeller(c:Context<AppEnv>,id:string|null){if(!id)return;const user=await c.env.DB.prepare("SELECT id FROM user WHERE id=? AND role='vendedor' AND active=1 AND banned=0").bind(id).first();if(!user)fail(422,'SELLER','Selecciona un vendedor activo.');}
export function caracasDate(date=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Caracas',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
export function visitFits(client:Client,iso:string){const date=new Date(iso);if(!Number.isFinite(date.getTime()))return false;const dayDate=caracasDate(date),local=new Date(dayDate+'T12:00:00Z'),day=local.getUTCDay();const time=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Caracas',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
  if(!client.slots.some(s=>s.day===day&&s.start<=time&&time<s.end))return false;
  const anchor=new Date(client.recurrenceStart+'T00:00:00Z'),target=new Date(dayDate+'T00:00:00Z'),days=Math.floor((+target-+anchor)/86400000);if(days<0)return false;
  if(client.recurrence==='quincenal')return Math.floor(days/7)%2===0;
  if(client.recurrence==='mensual')return Math.floor((local.getUTCDate()-1)/7)===Math.floor((anchor.getUTCDate()-1)/7);
  return true;
}
export function requireSchedule(c:Client,at:string){if(!visitFits(c,at))fail(422,'VISIT_WINDOW','La fecha no coincide con los días, horario o recurrencia del negocio.');}
