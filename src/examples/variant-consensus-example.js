// Simulated diploid and haploid calls on a synthetic 360-base reference.
const reference='ACGT'.repeat(90);
export const variantConsensusExample=`>demo_chr Synthetic reference for genotype interpretation\n${reference.match(/.{1,60}/g).join('\n')}\n##SMS3_VARIANTS##\n##fileformat=VCFv4.2\n##contig=<ID=demo_chr,length=360>\n##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">\n##FORMAT=<ID=PS,Number=1,Type=Integer,Description="Phase set">\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tSample_A\tSample_B\tHaploid_C\n${[
[25,'snp1','A','G','0|1:25','1|1:25','1:.'],
[58,'snp2','C','T','1|0:25','0|0:25','0:.'],
[109,'ins1','A','ATT','1|1:25','0|1:25','1:.'],
[165,'del1','ACG','A','1|1:25','1|0:25','1:.'],
[230,'snp3','C','G,T','1|2:25','2|2:25','2:.'],
[301,'snp4','A','C','1|0:25','0|1:25','1:.']
].map(([p,id,ref,alt,a,b,c])=>`demo_chr\t${p}\t${id}\t${ref}\t${alt}\t60\tPASS\t.\tGT:PS\t${a}\t${b}\t${c}`).join('\n')}\n`;
