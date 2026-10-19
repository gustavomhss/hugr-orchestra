#!/bin/sh
set -eu
LC_ALL=C; export LC_ALL
umask 077
fail() { printf '%s\n' "installer: $*" >&2; exit 1; }
linux_host_libc() {
  runtime_cpu=$1; runtime_pid=$2
  runtime_size=$(stat -Lc '%s' "/proc/$runtime_pid/exe") || fail 'cannot stat Linux host runtime ELF'
  runtime_header=$(od -An -v -tu1 -N64 "/proc/$runtime_pid/exe") || fail 'cannot read Linux host runtime ELF'
  # Check the producer separately: valid-looking bytes with nonzero od exit
  # cannot become successful admission through a pipeline's final awk status.
  runtime_layout=$(printf '%s\n' "$runtime_header" | awk -v cpu="$runtime_cpu" -v size="$runtime_size" '
    function le(p,w, i,v,m) { v=0; m=1; for(i=0;i<w;i++) { if(i>=4 && b[p+i]!=0) exit 1; v+=b[p+i]*m; m*=256 } return v }
    { for(i=1;i<=NF;i++) { if($i!~/^[0-9]+$/ || $i>255) exit 1; b[++n]=$i } }
    END { if(n!=64 || size!~/^[0-9]+$/ || size<64 || size>2147483647 ||
      b[1]!=127 || b[2]!=69 || b[3]!=76 || b[4]!=70 || b[5]!=2 || b[6]!=1 || b[7]!=1 ||
      (le(17,2)!=2 && le(17,2)!=3) || le(19,2)!=(cpu=="x64" ? 62 : 183) || le(21,4)!=1 || le(53,2)!=64 || le(55,2)!=56) exit 1
      start=le(33,8); count=le(57,2); extent=count*56
      if(!count || start<64 || start>2147483647 || start+extent>size) exit 1
      printf "%.0f %.0f\n",start,extent }
  ') || fail 'cannot inspect Linux host runtime ELF'
  set -- $runtime_layout
  [ "$#" = 2 ] || fail 'invalid Linux host program header layout'
  runtime_programs=$(od -An -v -tu1 -j "$1" -N "$2" "/proc/$runtime_pid/exe") || fail 'cannot read Linux host program headers'
  runtime_interp_range=$(printf '%s\n' "$runtime_programs" | awk -v expected="$2" -v size="$runtime_size" '
    function le(p,w, i,v,m) { v=0; m=1; for(i=0;i<w;i++) { if(i>=4 && b[p+i]!=0) exit 1; v+=b[p+i]*m; m*=256 } return v }
    { for(i=1;i<=NF;i++) { if($i!~/^[0-9]+$/ || $i>255) exit 1; b[++n]=$i } }
    END { if(n!=expected) exit 1
      for(h=1;h<=n;h+=56) if(le(h,4)==3) {
        found++; start=le(h+8,8); extent=le(h+32,8); memory=le(h+40,8)
        if(extent<2 || extent>4096 || memory<extent || start>2147483647 || start+extent>size) exit 1
      }
      if(found!=1) exit 1
      printf "%.0f %.0f\n",start,extent }
  ') || fail 'Linux host PT_INTERP missing or invalid'
  set -- $runtime_interp_range
  [ "$#" = 2 ] || fail 'invalid Linux host interpreter range'
  runtime_interp_bytes=$(od -An -v -tu1 -j "$1" -N "$2" "/proc/$runtime_pid/exe") || fail 'cannot read Linux host interpreter'
  runtime_interpreter=$(printf '%s\n' "$runtime_interp_bytes" | awk -v expected="$2" '
    { for(i=1;i<=NF;i++) { if($i!~/^[0-9]+$/ || $i>255) exit 1; b[++n]=$i } }
    END { if(n!=expected || b[n]!=0 || b[1]!=47) exit 1
      for(i=1;i<n;i++) { c=sprintf("%c",b[i]); if(c!~/^[A-Za-z0-9\/_.+-]$/) exit 1; text=text c }
      print text }
  ') || fail 'invalid Linux host PT_INTERP string'
  case "$runtime_cpu:${runtime_interpreter##*/}" in
    x64:ld-musl-x86_64.so.1|arm64:ld-musl-aarch64.so.1) runtime_loader_libc=musl ;;
    x64:ld-linux-x86-64.so.2|arm64:ld-linux-aarch64.so.1) runtime_loader_libc=glibc ;;
    *) fail 'unknown Linux host interpreter' ;;
  esac
  runtime_loader=$(readlink -f -- "$runtime_interpreter") || fail 'cannot resolve Linux host interpreter'
  case "$runtime_loader" in /*) ;; *) fail 'invalid Linux host interpreter path' ;; esac
  [ -f "$runtime_loader" ] && [ ! -L "$runtime_loader" ] || fail 'Linux host interpreter is not a physical regular file'
  runtime_identity=$(stat -Lc '%D %i' -- "$runtime_loader") || fail 'cannot stat Linux host interpreter identity'
  set -- $runtime_identity
  [ "$#" = 2 ] || fail 'invalid Linux host interpreter identity'
  runtime_loaded_libc=$(awk -v cpu="$runtime_cpu" -v loader="$runtime_loader" -v device="$1" -v inode="$2" '
    function hex(s) { sub(/^0+/,"",s); return s=="" ? "0" : s }
    BEGIN {
      if(device!~/^[0-9a-f]+$/ || length(device)>16 || inode!~/^[0-9]+$/ || inode==0) bad=1
      while(length(device)<16) device="0" device
      major=hex(substr(device,1,5) substr(device,12,3)); minor=hex(substr(device,6,6) substr(device,15,2))
    }
    { lines++
      if(NF<5 || $1!~/^[0-9a-f]+-[0-9a-f]+$/ || $2!~/^[rwxps-]+$/ || length($2)!=4 ||
         $3!~/^[0-9a-f]+$/ || $4!~/^[0-9a-f]+:[0-9a-f]+$/ || $5!~/^[0-9]+$/) bad=1
      if($6==loader) {
        split($4,dev,":")
        if(NF!=6 || ("i" $5)!=("i" inode) || ("d" hex(dev[1]))!=("d" major) || ("d" hex(dev[2]))!=("d" minor)) bad=1
        if($2~/x/) mapped=1
      }
      name=$6; sub(/^.*\//,"",name)
      if(name ~ /qemu|gcompat/) bad=1
      g=(name=="libc.so.6" || name~/^libc-[0-9]+\.[0-9]+\.so$/)
      m=(name==(cpu=="x64" ? "libc.musl-x86_64.so.1" : "libc.musl-aarch64.so.1") ||
         name==(cpu=="x64" ? "ld-musl-x86_64.so.1" : "ld-musl-aarch64.so.1"))
      if(g || m) {
        if(NF!=6 || $6!~/^\// || $5==0) bad=1
        if(g) glibc=1
        if(m) musl=1
        if($2 ~ /x/) { if(g) gx=1; if(m) mx=1 }
      }
    }
    END { if(!lines || bad || !mapped || glibc==musl || (glibc && !gx) || (musl && !mx)) exit 1
      print musl ? "musl" : "glibc" }
  ' "/proc/$runtime_pid/maps") || fail 'cannot determine Linux host libc from loaded process'
  case "$runtime_loaded_libc" in glibc|musl) ;; *) fail 'cannot determine Linux host libc from loaded process' ;; esac
  [ "$runtime_loaded_libc" = "$runtime_loader_libc" ] || fail 'Linux host interpreter does not match loaded libc'
  printf '%s\n' "$runtime_loaded_libc"
}
prefix= version= target= archive= digest= rollback=
while [ "$#" -gt 0 ]; do
  [ "$#" -ge 2 ] || fail 'every option requires a value'
  case "$1" in
    --prefix) [ -z "$prefix" ] || fail 'duplicate prefix'; prefix=$2 ;;
    --version) [ -z "$version" ] || fail 'duplicate version'; version=$2 ;;
    --target) [ -z "$target" ] || fail 'duplicate target'; target=$2 ;;
    --archive) [ -z "$archive" ] || fail 'duplicate archive'; archive=$2 ;;
    --sha256) [ -z "$digest" ] || fail 'duplicate digest'; digest=$2 ;;
    --rollback) [ -z "$rollback" ] || fail 'duplicate rollback'; rollback=$2 ;;
    *) fail 'unknown option' ;;
  esac
  shift 2
done
case "$prefix" in /*) ;; *) fail 'prefix must be absolute' ;; esac
[ "$prefix" != / ] || fail 'root prefix refused'
case "$prefix" in */|*//*|*/./*|*/../*|*/.|*/..) fail 'prefix must be normalized' ;; esac
if [ -n "$rollback" ]; then
  [ -z "$version$archive$digest" ] || fail 'rollback cannot include install options'
  version=$rollback
else
  [ -n "$archive" ] && [ "${#digest}" -eq 64 ] || fail 'archive and exact SHA-256 required'
  case "$digest" in *[!0-9a-fA-F]*) fail 'invalid SHA-256' ;; esac
  digest=$(printf '%s' "$digest" | tr A-F a-f)
fi
case "$version" in ''|[!0-9A-Za-z]*|*[!0-9A-Za-z._+-]*|*..*) fail 'unsafe version' ;; esac
case "$target" in
  linux-arm64|linux-x64|linux-x64-baseline|linux-arm64-musl|linux-x64-musl|linux-x64-baseline-musl|darwin-arm64|darwin-x64|darwin-x64-baseline) ;;
  *) fail 'unsupported POSIX target' ;;
esac
os=${target%%-*}; cpu=${target#*-}; cpu=${cpu%%-*}
host=$(uname -s)
case "$host" in Linux) host_os=linux ;; Darwin) host_os=darwin ;; *) fail 'unsupported host' ;; esac
case "$(uname -m)" in x86_64|amd64) host_cpu=x64 ;; arm64|aarch64) host_cpu=arm64 ;; *) fail 'unsupported host CPU' ;; esac
[ "$os-$cpu" = "$host_os-$host_cpu" ] || fail 'target does not match host OS/CPU'
# Inspect this running shell, not an ldd command's exit status or a loader merely
# present on disk. A static shell, unreadable/unknown maps, compatibility libc or
# mixed libc cannot establish an ABI. No prefix or lock has been touched here.
if [ "$os" = linux ]; then
  host_libc=$(linux_host_libc "$cpu" "$$") || exit 1
  case "$host_libc" in glibc|musl) ;; *) fail 'cannot determine Linux host libc from loaded process' ;; esac
  case "$target" in *-musl) target_libc=musl ;; *) target_libc=glibc ;; esac
  [ "$host_libc" = "$target_libc" ] || fail 'target does not match host libc'
fi
if command -v sha256sum >/dev/null 2>&1; then hash() { sha256sum "$1" | cut -d ' ' -f 1; }
elif command -v shasum >/dev/null 2>&1; then hash() { shasum -a 256 "$1" | cut -d ' ' -f 1; }
else fail 'sha256sum or shasum required'; fi
[ ! -L "$prefix" ] || fail 'symlink prefix refused'
mkdir -p "$prefix"
[ -d "$prefix" ] && [ ! -L "$prefix" ] || fail 'prefix must be a real directory'
mkdir "$prefix/.install-lock" 2>/dev/null || fail 'prefix locked'
stage=
# Extraction may restore mode 000 after writing descendants. Restore access before
# descending; recursive chmod/find cannot first traverse an inaccessible parent.
# Call only on this invocation's stage, never on retained versions or current.
restore_stage_dirs() (
  [ ! -L "$1" ] && [ -d "$1" ] || return 0
  chmod u+rwx "$1" || return 1
  restored=0
  for child in "$1"/* "$1"/.[!.]* "$1"/..?*; do
    [ ! -L "$child" ] && [ -d "$child" ] || continue
    restore_stage_dirs "$child" || restored=1
  done
  return "$restored"
)
cleanup() {
  status=$?
  trap - 0
  incomplete=0
  if [ -n "$stage" ]; then
    if ! restore_stage_dirs "$stage"; then
      printf '%s\n' 'installer: stage permission cleanup failed' >&2
      incomplete=1
    fi
    if ! rm -rf "$stage"; then
      printf '%s\n' 'installer: stage removal failed' >&2
      incomplete=1
    fi
  fi
  # A stage failure must not strand our exclusively acquired lock under set -e.
  if ! rmdir "$prefix/.install-lock"; then
    printf '%s\n' 'installer: lock removal failed' >&2
    incomplete=1
  fi
  [ "$status" -ne 0 ] || status=$incomplete
  exit "$status"
}
trap cleanup 0
trap 'exit 1' HUP INT TERM
stage=$(mktemp -d "$prefix/.install-XXXXXXXX")
for dir in versions bin; do
  [ ! -L "$prefix/$dir" ] || fail "symlink $dir refused"
  mkdir -p "$prefix/$dir"
done
[ ! -e "$prefix/current" ] || [ -L "$prefix/current" ] || fail 'current must be a symlink'
if [ -e "$prefix/bin/orchestra" ] || [ -L "$prefix/bin/orchestra" ]; then
  [ -L "$prefix/bin/orchestra" ] && [ "$(readlink "$prefix/bin/orchestra")" = ../current/bin/orchestra ] || fail 'launcher conflict'
fi
safe_paths() {
  awk '
    { p=$0; sub(/\/$/, "", p)
      if (p !~ /^[ -~]+$/ || p ~ /[\\:<>"|?*]/) exit 1
      n=split(p,a,"/"); for(i=1;i<=n;i++)
        if(a[i]=="" || a[i] ~ /[. ]$/ || tolower(a[i]) ~ /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/) exit 1
      if (p!="bin" && p!~/^bin\// && p!="package.json" && p!="distribution.json" && p!="checksums.sha256") exit 1
      if (seen[p]++) exit 1
    }
    END {if(!NR) exit 1}' "$1" || fail 'unsafe or duplicate payload paths'
}
verify() {
  tree=$1
  [ -d "$tree" ] && [ ! -L "$tree" ] || fail 'version is not a real tree'
  find "$tree" ! -type f ! -type d > "$stage/special"
  [ ! -s "$stage/special" ] || fail 'nonregular payload entry'
  find "$tree" -type f -links +1 > "$stage/special"
  [ ! -s "$stage/special" ] || fail 'hardlinked payload entry'
  find "$tree" -type f -size 0 > "$stage/special"
  [ ! -s "$stage/special" ] || fail 'empty payload file'
  (cd "$tree" && find . -mindepth 1 | cut -c 3-) > "$stage/treepaths"
  safe_paths "$stage/treepaths"
  (cd "$tree" && find . -type f | cut -c 3- | sort) > "$stage/inventory"
  safe_paths "$stage/inventory"
  [ -f "$tree/checksums.sha256" ] || fail 'missing checksum table'
  awk 'length($0)<67 || substr($0,1,64)~/[^0-9a-f]/ || substr($0,65,2)!="  " || substr($0,67)=="checksums.sha256" {exit 1} {print substr($0,67)}' \
    "$tree/checksums.sha256" > "$stage/paths" || fail 'invalid checksum table'
  safe_paths "$stage/paths"
  { cat "$stage/paths"; printf '%s\n' checksums.sha256; } | sort > "$stage/expected"
  cmp -s "$stage/inventory" "$stage/expected" || fail 'checksum inventory mismatch'
  while IFS= read -r line || [ -n "$line" ]; do
    sum=${line%%  *}; file=${line#*  }
    [ "$(hash "$tree/$file")" = "$sum" ] || fail "checksum mismatch: $file"
  done < "$tree/checksums.sha256"
  # Parse JSON as data. Node IDs prevent unknown keys containing slashes from aliasing required fields.
  metadata() { awk -v version="$version" -v target="$target" -v os="$os" -v cpu="$cpu" -v modes="$stage/modes" '
     function bad() { exit 1 }
     function ws() { while(substr(s,pos,1) ~ /[ \t\r\n]/ && pos<=length(s)) pos++ }
     function unicode(n) {
       if(n<128) return sprintf("%c",n)
       if(n<2048) return sprintf("%c%c",192+int(n/64),128+n%64)
       return sprintf("%c%c%c",224+int(n/4096),128+int(n/64)%64,128+n%64)
     }
     function str(    out,c,e,h,n,j) {
       if(substr(s,pos++,1)!="\"") bad()
       while(pos<=length(s)) {
         c=substr(s,pos++,1); if(c=="\"") return out
         if(c ~ /[\001-\037]/ || c==sprintf("%c",0)) bad()
         if(c!="\\") {out=out c; continue}
         e=substr(s,pos++,1)
         if(e=="\"" || e=="\\" || e=="/") out=out e
         else if(e=="b") out=out sprintf("%c",8)
         else if(e=="f") out=out sprintf("%c",12)
         else if(e=="n") out=out "\n"
         else if(e=="r") out=out "\r"
         else if(e=="t") out=out "\t"
         else if(e=="u") {
           h=substr(s,pos,4); if(length(h)!=4 || h~/[^0-9a-fA-F]/) bad(); pos+=4; n=0
           for(j=1;j<=4;j++) n=n*16+index("0123456789abcdef",tolower(substr(h,j,1)))-1
           out=out unicode(n)
         } else bad()
       }; bad()
     }
     function val(depth,    id,c,key,n,endchar,t) {
       if(depth>256) bad(); id=++nodes; ws(); c=substr(s,pos,1)
       if(c=="\"") { v[id]=str(); kind[id]="s"; return id }
       if(c=="{" || c=="[") {
         kind[id]=c; endchar=(c=="{" ? "}" : "]"); pos++; ws(); n=0
         if(substr(s,pos,1)==endchar) {pos++; count[id]=0; return id}
         while(1) {
           if(c=="{") { ws(); key=str(); if(seen[id SUBSEP key]++) bad(); ws(); if(substr(s,pos++,1)!=":") bad() }
           else key=n
           child[id SUBSEP key]=val(depth+1); n++; ws(); t=substr(s,pos++,1)
           if(t==endchar) break; if(t!=",") bad()
         }; count[id]=n; return id
       }
       if(substr(s,pos,4)=="true") {v[id]="true"; kind[id]="b"; pos+=4; return id}
       if(substr(s,pos,5)=="false") {v[id]="false"; kind[id]="b"; pos+=5; return id}
       if(substr(s,pos,4)=="null") {kind[id]="null"; pos+=4; return id}
       t=substr(s,pos)
       if(match(t,/^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/)) {kind[id]="n"; pos+=RLENGTH; return id}
       bad()
     }
     function field(id,key) {return child[id SUBSEP key]}
     function string(id,wanted) {return kind[id]=="s" && v[id]==wanted}
     { s=s $0 "\n" }
     END {
       pos=1; root=val(0); ws(); if(pos<=length(s) || kind[root]!="{") bad()
       if(!string(field(root,"version"),version) || v[field(root,"version")]!~/^[!-~]+$/) bad()
       if(FILENAME ~ /distribution.json$/) {
         files=field(root,"files")
         if(count[root]!=4 || !string(field(root,"schema"),"orchestra-distribution-v1") || !string(field(root,"target"),target) || kind[files]!="[" || !count[files]) bad()
         for(i=0;i<count[files];i++) {
           p=field(files,i); f=v[field(p,"path")]; h=v[field(p,"sha256")]; x=v[field(p,"executable")]
           if(kind[p]!="{" || count[p]!=3 || kind[field(p,"path")]!="s" || kind[field(p,"sha256")]!="s" || length(h)!=64 || h~/[^0-9a-f]/ || kind[field(p,"executable")]!="b") bad()
           if(f!="package.json" && f!~/^bin\//) bad()
           if((f=="bin/orchestra" || f=="bin/hugr-omni-supervisor") && x!="true") bad()
           print h "  " f; print x "  " f > modes
         }
       } else {
         a=field(root,"os"); b=field(root,"cpu")
         if(!string(field(root,"name"),"@humanguardrail/cli-" target) || kind[a]!="[" || count[a]!=1 || !string(field(a,0),os) || kind[b]!="[" || count[b]!=1 || !string(field(b,0),cpu)) bad()
       }
    }' "$1"; }
  metadata "$tree/distribution.json" > "$stage/descriptor" || fail 'invalid distribution descriptor'
  metadata "$tree/package.json" > /dev/null || fail 'package metadata mismatch'
  awk '{print substr($0,67)}' "$stage/descriptor" > "$stage/paths"
  safe_paths "$stage/paths"
  { cat "$stage/descriptor"; printf '%s  distribution.json\n' "$(hash "$tree/distribution.json")"; } | sort > "$stage/expected"
  sort "$tree/checksums.sha256" > "$stage/table"
  cmp -s "$stage/expected" "$stage/table" || fail 'descriptor inventory mismatch'
  # Closed reserved inventory mirrors @orchestra/script/tree-sitter-prebuilds treeSitterBundle.
  : > "$stage/reserved"
  for file in bin/orchestra bin/hugr_omni.node bin/hugr-omni-supervisor; do
    [ -f "$tree/$file" ] || fail "missing companion: $file"
  done
  for pkg in tree-sitter tree-sitter-python tree-sitter-typescript; do
    for file in package.json LICENSE "prebuilds/$os-$cpu/$pkg.node"; do
      [ -f "$tree/bin/tree-sitter/$pkg/$file" ] || fail "missing tree-sitter: $pkg/$file"
      printf '%s\n' "bin/tree-sitter/$pkg/$file" >> "$stage/reserved"
    done
  done
  for file in tree-sitter/index.js tree-sitter-python/bindings/node/index.js tree-sitter-python/src/node-types.json tree-sitter-typescript/bindings/node/index.js tree-sitter-typescript/typescript/src/node-types.json tree-sitter-typescript/tsx/src/node-types.json; do
    [ -f "$tree/bin/tree-sitter/$file" ] || fail "missing tree-sitter: $file"
    printf '%s\n' "bin/tree-sitter/$file" >> "$stage/reserved"
  done
  printf '%s\n' bin/hugr_omni.node bin/hugr-omni-supervisor >> "$stage/reserved"
  sort "$stage/reserved" > "$stage/expected"
  awk '/^bin\/tree-sitter\// || /^bin\/hugr/' "$stage/inventory" > "$stage/reserved"
  cmp -s "$stage/expected" "$stage/reserved" || fail 'unexpected reserved companion inventory'
  while IFS= read -r file; do
    case "$file" in *.node) native_header "$tree/$file" || fail "native binding target mismatch: $file" ;; esac
  done < "$stage/inventory"
  printf '%s\n' 'false  distribution.json' 'false  checksums.sha256' >> "$stage/modes"
  while IFS= read -r line; do
    executable=${line%%  *}; file=${line#*  }
    if [ "$tree" = "$stage/payload" ]; then
      case "$executable" in true) chmod 755 "$tree/$file" ;; false) chmod 644 "$tree/$file" ;; esac
    fi
    find "$tree/$file" \( -perm -100 -o -perm -010 -o -perm -001 \) -print > "$stage/mode"
    if [ "$executable" = true ]; then [ -s "$stage/mode" ] || fail "executable mode mismatch: $file"
    else [ ! -s "$stage/mode" ] || fail "executable mode mismatch: $file"; fi
  done < "$stage/modes"
  "$tree/bin/orchestra" --version > "$stage/version"
  printf '%s\n' "$version" > "$stage/wanted-version"
  cmp -s "$stage/version" "$stage/wanted-version" || fail 'CLI version mismatch'
}
native_header() {
  dd if="$1" of="$stage/native-header" bs=4096 count=1 2>/dev/null || return 1
  od -An -v -tu1 "$stage/native-header" > "$stage/native-bytes" || return 1
  awk -v os="$os" -v cpu="$cpu" -v size="$(wc -c < "$1")" '
    function le(p) {return b[p]+256*b[p+1]+65536*b[p+2]+16777216*b[p+3]}
    function be(p) {return 16777216*b[p]+65536*b[p+1]+256*b[p+2]+b[p+3]}
    {for(i=1;i<=NF;i++) b[n++]=$i}
    END {
      if(os=="linux") {
        machine=(cpu=="x64" ? 62 : 183)
        if(n<64 || be(0)!=2135247942 || b[4]!=2 || b[5]!=1 || b[6]!=1 || b[18]+256*b[19]!=machine || b[52]+256*b[53]!=64) exit 1
        exit 0
      }
      machine=(cpu=="x64" ? 16777223 : 16777228)
      if(n>=32 && le(0)==4277009103 && le(4)==machine) exit 0
      if(n>=32 && be(0)==4277009103 && be(4)==machine) exit 0
      magic=be(0); if(n<8 || (magic!=3405691582 && magic!=3405691583)) exit 1
      step=(magic==3405691582 ? 20 : 32); count=be(4)
      if(count<1 || count>(n-8)/step) exit 1
      for(j=0;j<count;j++) {
        p=8+j*step
        offset=(step==20 ? be(p+8) : be(p+8)*4294967296+be(p+12))
        span=(step==20 ? be(p+12) : be(p+16)*4294967296+be(p+20))
        if(offset<8+count*step || span<32 || offset>size-span) exit 1
        if(be(p)==machine) {found=1; printf "%.0f\n",offset}
      }
      if(!found) exit 1
    }' "$stage/native-bytes" > "$stage/native-offsets" || return 1
  while IFS= read -r offset; do
    od -j "$offset" -N 32 -An -v -tu1 "$1" > "$stage/native-slice" || return 1
    awk -v cpu="$cpu" '
      function le(p) {return b[p]+256*b[p+1]+65536*b[p+2]+16777216*b[p+3]}
      function be(p) {return 16777216*b[p]+65536*b[p+1]+256*b[p+2]+b[p+3]}
      {for(i=1;i<=NF;i++) b[n++]=$i}
      END {machine=(cpu=="x64" ? 16777223 : 16777228)
        if(n<32 || !((le(0)==4277009103 && le(4)==machine) || (be(0)==4277009103 && be(4)==machine))) exit 1}
    ' "$stage/native-slice" || return 1
  done < "$stage/native-offsets"
}
destination="$prefix/versions/$version-$target"
if [ -z "$rollback" ]; then
  case "$archive" in
    https://*) curl --fail --silent --show-error --proto '=https' --proto-redir '=https' --tlsv1.2 --location "$archive" -o "$stage/archive" ;;
    *://*) fail 'only HTTPS URLs supported' ;;
    *) case "$archive" in /*) ;; *) archive="$PWD/$archive" ;; esac
       [ -f "$archive" ] && [ "$(hash "$archive")" = "$digest" ] || fail 'archive checksum mismatch'; cp "$archive" "$stage/archive" ;;
  esac
  [ "$(hash "$stage/archive")" = "$digest" ] || fail 'archive checksum mismatch'
  tar -tf "$stage/archive" > "$stage/list"
  safe_paths "$stage/list"
  tar -tvf "$stage/archive" > "$stage/types"
  awk 'substr($0,1,1)!="-" && substr($0,1,1)!="d" {exit 1}' "$stage/types" || fail 'unsafe archive entry type'
  [ "$(wc -l < "$stage/list")" = "$(wc -l < "$stage/types")" ] || fail 'ambiguous archive listing'
  mkdir "$stage/payload"
  tar -xf "$stage/archive" -C "$stage/payload"
  restore_stage_dirs "$stage" || fail 'stage permission restoration failed'
  verify "$stage/payload"
  if [ -e "$destination" ] || [ -L "$destination" ]; then
    verify "$destination"
    cmp -s "$stage/payload/checksums.sha256" "$destination/checksums.sha256" || fail 'immutable version conflict'
  else mv "$stage/payload" "$destination"; fi
else verify "$destination"; fi
[ -L "$prefix/bin/orchestra" ] || ln -s ../current/bin/orchestra "$prefix/bin/orchestra"
ln -s "versions/$version-$target" "$stage/current"
# BSD and GNU mv need different flags to replace a directory symlink itself.
case "$host" in Darwin) mv -fh "$stage/current" "$prefix/current" ;; Linux) mv -fT "$stage/current" "$prefix/current" ;; esac
printf '%s\n' "Selected $version ($target)"
