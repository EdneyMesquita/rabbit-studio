#!/bin/bash
# Per-thread CPU of the release app with every saved cluster connected.
# Build: npx tauri build --no-bundle --features smoke
# Run:   MODE=load DUR=60 scripts/measure-live.sh   (MODE=idle for the baseline)
SP=${TMPDIR:-/tmp}/rabbit-studio-measure; mkdir -p $SP
rm -f $SP/load.json
cd "$(dirname "$0")/../src-tauri"
RABBIT_STUDIO_SMOKE=$SP/load.json RABBIT_STUDIO_SMOKE_MODE=${MODE:-load} ./target/release/rabbit-studio >/dev/null 2>&1 &
P=$!
until [ -f $SP/load.json ]; do sleep 1; done
pids=($P $(pgrep -P $P))
snap() { for p in "${pids[@]}"; do for t in /proc/$p/task/*; do [ -r $t/stat ] && echo "$p $(basename $t) $(cat $t/comm | tr ' ' _) $(awk '{print $14+$15}' $t/stat)"; done; done; }
snap > $SP/t0; sleep ${DUR:-20}; snap > $SP/t1
python3 - "$SP/t0" "$SP/t1" "$P" <<'PY'
import sys
a={};b={}
for f,d in ((sys.argv[1],a),(sys.argv[2],b)):
    for l in open(f):
        p,t,c,v=l.split(); d[(p,t)]=(c,int(v))
rows=[]
for k,(c,v) in b.items():
    d=v-a.get(k,(c,0))[1]
    if d>0: rows.append((d,k[0],c))
rows.sort(reverse=True)
tot=sum(r[0] for r in rows)
print("total ticks",tot)
for d,p,c in rows[:12]: print(d,p,c)
PY
kill $P; wait $P 2>/dev/null
