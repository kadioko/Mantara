type Point={id:string;code:string;latitude:number|string;longitude:number|string;kind:"sample"|"drill";grade?:number|string|null};
type Boundary={id:string;name:string;geojson:{type?:string;coordinates?:unknown}};
type Labels={empty:string;sample:string;drill:string;boundary:string};
type Coordinate=[number,number];

function rings(boundary:Boundary):Coordinate[][]{
  const c=boundary.geojson?.coordinates;
  if(!Array.isArray(c))return[];
  const source=boundary.geojson.type==="MultiPolygon"?c.flat(1):c;
  return source.filter(Array.isArray).map(ring=>(ring as unknown[]).filter(x=>Array.isArray(x)&&x.length>=2).map(x=>[Number((x as unknown[])[0]),Number((x as unknown[])[1])] as Coordinate)).filter(r=>r.length>2);
}

export function ExplorationPlot({points,boundaries,labels}:{points:Point[];boundaries:Boundary[];labels:Labels}){
  const shapes=boundaries.flatMap(b=>rings(b).map(r=>({id:b.id,name:b.name,ring:r})));
  const coords=[...points.map(p=>[Number(p.longitude),Number(p.latitude)] as Coordinate),...shapes.flatMap(s=>s.ring)];
  if(!coords.length)return <p className="text-sm text-muted-foreground">{labels.empty}</p>;
  const xs=coords.map(p=>p[0]),ys=coords.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const x=(v:number)=>30+((v-minX)/(maxX-minX||1))*540,y=(v:number)=>270-((v-minY)/(maxY-minY||1))*240;
  return <div className="space-y-3"><svg role="img" aria-label={`${labels.sample} / ${labels.drill} / ${labels.boundary}`} viewBox="0 0 600 300" className="w-full rounded-xl border bg-muted/30">
    <path d="M30 20V270H580" fill="none" stroke="currentColor" opacity=".18"/>
    {shapes.map((shape,index)=><polygon key={`${shape.id}-${index}`} points={shape.ring.map(p=>`${x(p[0])},${y(p[1])}`).join(" ")} className="fill-primary/10 stroke-primary" strokeWidth="2"><title>{shape.name}</title></polygon>)}
    {points.map(p=><g key={`${p.kind}-${p.id}`}><circle cx={x(Number(p.longitude))} cy={y(Number(p.latitude))} r={p.kind==="sample"?6:8} className={p.kind==="sample"?"fill-primary":"fill-warning"}/><title>{p.code}{p.grade!=null?` · ${p.grade} PPM`:""}</title></g>)}
  </svg><div className="flex flex-wrap gap-4 text-xs text-muted-foreground"><span>● {labels.sample}</span><span>● {labels.drill}</span><span>▱ {labels.boundary}</span></div></div>;
}
