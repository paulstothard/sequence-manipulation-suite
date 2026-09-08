import{a as l,b as s,m as p}from"./chunk-T5P7M453.js";import"./chunk-B6JNHY6R.js";function S(){let e=1701,n=Array.from({length:1200},()=>(e=Math.imul(e,1664525)+1013904223>>>0,"ACGT"[e>>>30])).join("").replaceAll("GAATTC","GAGTTC").split("");n.splice(349,6,..."GAATTC"),n.splice(849,6,..."GAATTC");let t=n.join("");return`${s("amplicon Synthetic phased PCR-RFLP region",t)}##SMS3_VARIANTS##
##fileformat=VCFv4.2
##contig=<ID=amplicon,length=1200>
##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">
##FORMAT=<ID=PS,Number=1,Type=Integer,Description="Phase set">
#CHROM	POS	ID	REF	ALT	QUAL	FILTER	INFO	FORMAT	Demo
amplicon	351	EcoRI_loss	A	G	60	PASS	.	GT:PS	0|1:351
amplicon	610	insertion	${t[609]}	${t[609]}GCT	60	PASS	.	GT:PS	1|0:351
##SMS3_PRIMERS##
${s("Forward",t.slice(100,120))}${s("Reverse",p(t.slice(1080,1100)).split("").reverse().join(""))}`}async function D(){let{multipleAlignProteinExample:e}=await import("./chunk-LGPASUV3.js"),n=l(e)[0].sequence;if(n[17]!=="K")throw new Error("Unexpected beta-globin example sequence.");return s("HBB_reference",n)+s("HBB_K18A_engineered",n.slice(0,17)+"A"+n.slice(18))}async function R(){let{humanMitochondrionGenBankExample:e}=await import("./chunk-SQAZXNJ6.js"),n=e.split(/\nORIGIN[^\n]*\n/)[1].split("//")[0].replace(/[^a-z]/gi,"").toUpperCase();return s("NC_012920.1 Human mitochondrial reference",n)}function C(){let e=[["RPLP0",21.4,98],["HPRT1",24.2,94],["IL6",28.8,92],["CXCL8",26.6,96],["MKI67",25.7,97],["CDKN1A",27.1,95]],n=["Control","Low dose","High dose","Recovery"],t=[[0,0,0,0,0,0],[.03,-.02,-1.1,-.7,.8,-.5],[-.02,.03,-2.3,-1.8,1.6,-1.5],[.02,.01,-.2,-.3,.4,-.7]],i=["sample,target,condition,cq,efficiency,replicate,role,run"];for(let o=0;o<n.length;o++)for(let r=0;r<4;r++)for(let c=0;c<e.length;c++){let[m,u,f]=e[c];for(let a=0;a<3;a++){let A=[.14,-.27,.31,-.1][r]+Math.sin((o+1)*(r+2)*(c+1))*(c<2?.06:.3),h=u+t[o][c]+A+[-.09,.02,.08][a];i.push(`${["C","L","H","R"][o]}${r+1},${m},${n[o]},${h.toFixed(3)},${f},${a+1},sample,Run1`)}}for(let[o,,r]of e)for(let c of["ntc","nort"])i.push(`${c.toUpperCase()},${o},,undetermined,${r},1,${c},Run1`);return i.join(`
`)}function $(){let e=4901;return Array.from({length:80},(n,t)=>{let i=t>=60&&t<70?40:100,o=Array.from({length:i},()=>(e=Math.imul(e,1664525)+1013904223>>>0,"ACGT"[e>>>30])).join("");t>=70&&(o=o.slice(0,30)+"N".repeat(8)+o.slice(38));let r=t>=40&&t<60?"D".repeat(80)+"&".repeat(20):"D".repeat(i);return`@synthetic_${t+1}
${o}
+
${r}
`}).join("")}function I(){let e=["##fileformat=VCFv4.2","##contig=<ID=chrDemo,length=10000>",'##FILTER=<ID=LowQual,Description="Low quality">',"#CHROM	POS	ID	REF	ALT	QUAL	FILTER	INFO"];for(let t=0;t<36;t++){let i=101+t*200;e.push(`chrDemo	${i}	v${t+1}	A	G	${t%9===0?15:60}	${t%11===0?"LowQual":"PASS"}	.`)}e.push("chrDemo	99	boundary_deletion	ACG	A	60	PASS	.","chrDemo	500	last_base	A	T	60	PASS	.","chrDemo	501	after_target	A	ATG	60	PASS	.");let n=["chrDemo	100	500	Target_A","chrDemo	300	900	Target_B","chrDemo	2000	3000	Target_C","chrDemo	4000	5000	Target_D","chrDemo	6000	7000	Target_E","chrDemo	9000	9500	No_calls"];return e.join(`
`)+`
##SMS3_TARGETS##
`+n.join(`
`)+`
`}export{$ as fastqTrimmingExample,S as haplotypeRestrictionExample,D as proteinDigestComparisonExample,C as qpcrHeatmapExample,R as sequencingWorkflowExample,I as targetVariantExample};
