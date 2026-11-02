#!/usr/bin/perl
# The shipped data files -- shop, catalogue, categories.
#
#   perl tools/data.pl
#
# Catches wrong values that still render. A missing Marathi name does
# not throw; it draws a blank where a product should be, which looks
# like a broken app rather than a missing translation.
#
# The zone and route checks are gone with the route itself -- see
# parked/. The shop now delivers wherever the customer is.
use strict;
use warnings;
use JSON::PP;

my $here = $0; $here =~ s{[^/]+$}{};
my $D = ($here || './') . '../app/data/';

sub slurp {
  open my $f, '<:raw', $D . $_[0] or die "$_[0]: $!\n";
  local $/; my $j = JSON::PP->new->decode(<$f>); close $f; return $j;
}

my $shop = slurp('shop.json');
my $cat  = slurp('catalog.json');
my $cats = slurp('categories.json');
my $plan = slurp('runplan.json');

my $fails = 0;
sub bad { printf "  FAIL  %s\n", $_[0]; $fails++ }
sub ok  { printf "  ok    %s\n", $_[0] }

# The pack shapes a product tile may name, read out of icons.js
# rather than copied here. A copy of a list is a list that will
# disagree, and this one did: five glyphs added to icons.js failed
# this check for not being declared, while sitting in the file the
# check is meant to be checking against.
my %TILES = do {
  my $f = $D . '../icons.js';
  open my $h, '<:raw', $f or die "icons.js: $!\n";
  my $src = do { local $/; <$h> }; close $h;
  $src =~ /export const TILES = \[(.*?)\];/s
    or die "icons.js: no exported TILES list to read\n";
  my @names = ($1 =~ /'([a-z]+)'/g);
  die "icons.js: TILES parsed as only " . scalar(@names) . " names\n"
    unless @names >= 15;
  map { $_ => 1 } @names;
};
my %UNITS = map { $_ => 1 } qw(g kg ml l pc pkt dozen);
my @LANGS = qw(en mr hi);

# --- the shop ---------------------------------------------------------
for my $l (@LANGS) {
  bad("the shop has no $l name")    unless ($shop->{name}{$l} // '') =~ /\S/;
  bad("the shop has no $l address") unless ($shop->{addr}{$l} // '') =~ /\S/;
}
my $digits = ($shop->{phone} // ''); $digits =~ s/\D//g;
bad("the shop phone '" . ($shop->{phone} // '') . "' does not look dialable")
  unless length($digits) >= 10 && length($digits) <= 13;

# --- delivery ---------------------------------------------------------
my $del = $shop->{delivery} or die "shop.json has no delivery block\n";
for my $k (qw(fee freeOver minOrder)) {
  my $v = $del->{$k};
  bad("delivery.$k is missing"), next unless defined $v;
  bad("delivery.$k is not a whole rupee") unless $v == int($v);
  bad("delivery.$k is negative") if $v < 0;
}
# Free delivery is the offer the app makes out loud. If the data stops
# agreeing with the words, the words are a lie -- so they are checked.
if ($del->{freeAlways}) {
  bad('delivery says freeAlways but charges a fee') if $del->{fee};
  ok('delivery is free on every order, and the data agrees');
} else {
  ok(sprintf('delivery costs %d, free over %d', $del->{fee}, $del->{freeOver}));
}

# --- UPI --------------------------------------------------------------
my $upi = $shop->{upi} || {};
if (($upi->{vpa} // '') =~ /\S/) {
  bad("upi.vpa '$upi->{vpa}' is not a UPI id (expected name\@handle)")
    unless $upi->{vpa} =~ /^[\w.\-]{2,}\@[A-Za-z]{2,}$/;
  bad('upi.payeeName is empty -- the payer sees it in their UPI app')
    unless ($upi->{payeeName} // '') =~ /\S/;
  if ($upi->{demo}) {
    # A demo id is fine; a demo id that could RESOLVE is not. The
    # handle after the @ is what decides whether a UPI app can find a
    # payee at all, so that is what gets checked.
    my ($handle) = $upi->{vpa} =~ /\@(.+)$/;
    my %REAL = map { $_ => 1 } qw(ybl okaxis oksbi okhdfcbank okicici paytm
                                  apl ibl upi axl hdfcbank sbi icici yapl);
    if ($REAL{ lc($handle // '') }) {
      bad("upi.demo is true but '\@$handle' is a REAL payment handle -- "
        . "this QR could send a customer's money to whoever owns that id");
    } else {
      ok("UPI is a demo id that cannot resolve -- $upi->{vpa}");
      print "  note  the pay block carries a visible DEMO strip while upi.demo is true\n";
    }
  } else {
    ok("UPI is set up -- $upi->{vpa}") unless $fails;
  }
} else {
  print "\n  +-------------------------------------------------------+\n";
  print "  | UPI IS NOT SET UP                                     |\n";
  print "  |                                                       |\n";
  print "  | No QR and no pay button are shown while upi.vpa is    |\n";
  print "  | empty -- on purpose. A code pointing at the wrong id  |\n";
  print "  | sends a customer's money to a stranger, which is far  |\n";
  print "  | worse than showing nothing.                           |\n";
  print "  |                                                       |\n";
  print "  | Put the shop's UPI id in app/data/shop.json.          |\n";
  print "  +-------------------------------------------------------+\n\n";
}

if ($shop->{placeholder}) {
  bad('shop.json is still flagged as a placeholder');
} else {
  ok('the shop is real -- ' . $shop->{name}{en});
}
if ($shop->{demo}) {
  print "  note  demo orders are seeded on a fresh device (shop.json demo:true)\n";
}

# --- the code that opens the Store view -------------------------------
# What this can check is the SHAPE. Whether app/lock.js derives the
# same bytes as tools/setpin.pl cannot be checked from Perl, because
# one of them is WebCrypto -- that is proved by typing the code into a
# browser, and it is the one thing here that has to be done by hand.
if (my $st = $shop->{staff}) {
  my %shape = (
    salt   => qr/^[0-9a-f]{32}$/,
    proof  => qr/^[0-9a-f]{64}$/,
    seal   => qr/^[0-9a-f]{64}$/,
  );
  for my $k (sort keys %shape) {
    my $v = $st->{$k} // '';
    bad("staff.$k is missing or malformed -- re-run tools/setpin.pl")
      unless $v =~ $shape{$k};
  }
  my $it = $st->{iterations} // 0;
  # Below this the derivation stops being slow, and a six-digit code
  # has only a million possibilities -- the cost per guess IS the
  # protection.
  bad("staff.iterations is $it -- too few to be worth anything; re-run tools/setpin.pl")
    unless $it =~ /^\d+$/ && $it >= 100000;
  bad('staff.proof and staff.seal are the same value -- the file is wrong')
    if ($st->{proof} // 'a') eq ($st->{seal} // 'b');

  # The one mistake that would undo all of it: somebody writing the
  # code into the file so it is not forgotten. shop.json is fetched by
  # every visitor.
  for my $k (sort keys %$st) {
    next if $k =~ /^(salt|proof|seal|iterations|note)$/;
    bad("staff.$k is not part of this -- if it is the code itself, DELETE it: "
      . 'shop.json is served to everyone who opens the app');
  }
  ok('the Store view is behind a code, and the code is not in the file')
    unless $fails;
} else {
  print "  note  NO code is set -- anyone who taps Store sees the board,\n";
  print "        the picking lists and every order. Set one with:\n";
  print "        perl tools/setpin.pl <6 digits>\n";
}

# --- delivery windows -------------------------------------------------
my $n = 0;
for my $s (@{ $plan->{slots} }) {
  $n++;
  for my $k (qw(id label cutoff from to cap)) {
    bad("slot $s->{id} has no $k") unless defined $s->{$k};
  }
  for my $k (qw(cutoff from to)) {
    bad("slot $s->{id} $k='$s->{$k}' is not HH:MM")
      unless ($s->{$k} // '') =~ /^([01]\d|2[0-3]):[0-5]\d$/;
  }
  my $m = sub { my ($h, $mm) = split /:/, $_[0]; return $h * 60 + $mm };
  bad("slot $s->{id} closes after it starts") if $m->($s->{cutoff}) >= $m->($s->{from});
  bad("slot $s->{id} ends before it starts")  if $m->($s->{to}) <= $m->($s->{from});
  bad("slot $s->{id} cap is not a positive whole number")
    unless ($s->{cap} // 0) > 0 && $s->{cap} == int($s->{cap});
}
bad('there are no delivery windows at all') unless $n;
# Windows must not overlap, or an order could sit in two at once.
my @sorted = sort { $a->{from} cmp $b->{from} } @{ $plan->{slots} };
for my $i (1 .. $#sorted) {
  bad("windows $sorted[$i-1]{id} and $sorted[$i]{id} overlap")
    if $sorted[$i]{from} lt $sorted[$i - 1]{to};
}
ok("$n delivery windows, none overlapping: "
   . join(', ', map { "$_->{from}-$_->{to}" } @sorted));

# --- the order prefix, in the two places it has to live ---------------
#
# Postgres mints the order code in a generated column, and a generated
# column cannot read shop.json. So the letter is written twice and
# this is the only thing in the project that can see both copies. Left
# unchecked they drift the moment somebody edits one, and the symptom
# is a customer reading back a code the shopkeeper cannot find.
{
  my $want = $shop->{orderPrefix};
  if (!defined $want || $want !~ /^[A-Z]{1,2}$/) {
    bad("shop.json orderPrefix should be one or two capital letters, got "
        . (defined $want ? "'$want'" : 'nothing'));
  } else {
    my $sf = ($here || './') . '../db/schema.sql';
    if (open my $h, '<:raw', $sf) {
      my $sql = do { local $/; <$h> }; close $h;
      if ($sql =~ /generated always as \('([A-Za-z]{1,2})-'/) {
        my $got = $1;
        $got eq $want
          ? ok("order codes are '$want-0001' in shop.json and in schema.sql")
          : bad("order prefix disagrees: shop.json says '$want', schema.sql says '$got'");
      } else { bad('could not find the generated code column in db/schema.sql') }
    } else { bad("db/schema.sql is not readable: $!") }
  }
}

# --- categories -------------------------------------------------------
my %catid;
for my $c (@{ $cats->{categories} }) {
  bad("category $c->{id} reuses an id") if $catid{ $c->{id} }++;
  bad("category $c->{id} tile '$c->{tile}' is not a declared glyph") unless $TILES{ $c->{tile} };
  for my $l (@LANGS) {
    bad("category $c->{id} has no $l name") unless ($c->{name}{$l} // '') =~ /\S/;
  }
}
ok(scalar(keys %catid) . ' categories');

# --- products ---------------------------------------------------------
my (%pid, %percat, $untranslated, %bycat);
for my $p (@{ $cat->{products} }) {
  my $id = $p->{id};
  bad("product $id reuses an id") if $pid{$id}++;
  bad("product $id names category '$p->{cat}', which does not exist") unless $catid{ $p->{cat} };
  bad("product $id tile '$p->{tile}' is not a declared glyph") unless $TILES{ $p->{tile} };
  bad("product $id pack unit '$p->{pack}{u}' is not allowed") unless $UNITS{ $p->{pack}{u} };
  # Milan's Super Shoppe is a PURE VEG shop. That is a fact about
  # the business, not a filter on a list, so it belongs in a check
  # rather than in somebody's memory of a conversation: a catalogue
  # is edited by hand, by whoever is to hand, and the day eggs come
  # back in it will be as one ordinary-looking row among 114.
  #
  # Word boundaries matter here -- \begg matches "eggs" and does NOT
  # match "Deggi Mirch", which is a chilli powder and has to stay.
  for my $l (@LANGS) {
    my $name = $p->{name}{$l} // '';
    bad("product $id is not vegetarian: its $l name says '$1'")
      if $name =~ /\b(eggs?|chicken|mutton|fish|prawns?|bacon|meat)\b/i
      || $name =~ /(\xe0\xa4\x85\xe0\xa4\x82\xe0\xa4\xa1|\xe0\xa4\x9a\xe0\xa4\xbf\xe0\xa4\x95\xe0\xa4\xa8|\xe0\xa4\xae\xe0\xa4\xbe\xe0\xa4\x82\xe0\xa4\xb8)/;
  }
  for my $t (@{ $p->{tags} || [] }) {
    bad("product $id is not vegetarian: it carries the search tag '$t'")
      if $t =~ /\b(eggs?|chicken|mutton|fish|prawns?|bacon|meat)\b/i
      || $t =~ /(\xe0\xa4\x85\xe0\xa4\x82\xe0\xa4\xa1|\xe0\xa4\x9a\xe0\xa4\xbf\xe0\xa4\x95\xe0\xa4\xa8|\xe0\xa4\xae\xe0\xa4\xbe\xe0\xa4\x82\xe0\xa4\xb8)/;
  }
  $percat{ $p->{cat} }++;
  $bycat{$id} = $p->{cat};

  for my $k (qw(mrp price)) {
    bad("product $id $k=$p->{$k} is not a whole rupee") unless $p->{$k} == int($p->{$k});
    bad("product $id $k is not positive") unless $p->{$k} > 0;
  }
  bad("product $id sells at $p->{price} ABOVE its MRP $p->{mrp}") if $p->{price} > $p->{mrp};
  bad("product $id stock is negative") if ($p->{stock} // 0) < 0;

  for my $l (@LANGS) {
    bad("product $id has no $l name") unless ($p->{name}{$l} // '') =~ /\S/;
  }
  $untranslated++ if ($p->{name}{mr} // '') eq ($p->{name}{en} // '')
                  || ($p->{name}{hi} // '') eq ($p->{name}{en} // '');
}
ok(scalar(keys %pid) . ' products across ' . scalar(keys %percat) . ' categories');
for my $c (sort keys %catid) {
  bad("category $c has no products") unless $percat{$c};
}
printf "  note  %d product names are still identical in en and mr/hi\n", $untranslated
  if $untranslated;

# --- what goes with what ----------------------------------------------
# A pairing that names a product the shop no longer stocks is invisible
# at runtime -- it is skipped silently and the suggestion just never
# appears, which looks like the feature being weak rather than the data
# being stale.
my $pairs = eval { slurp('pairs.json') };
if (!$pairs) {
  print "  note  no pairs.json -- the basket will suggest nothing\n";
} else {
  my ($named, $self, $dangling) = (0, 0, 0);
  for my $from (sort keys %{ $pairs->{byProduct} }) {
    bad("pairs: '$from' is not a product") unless $pid{$from};
    for my $to (@{ $pairs->{byProduct}{$from} }) {
      $named++;
      bad("pairs: $from suggests '$to', which is not a product"), $dangling++ unless $pid{$to};
      bad("pairs: $from suggests itself") if $to eq $from;
      $self++ if $to eq $from;
    }
  }
  for my $from (sort keys %{ $pairs->{byCategory} }) {
    bad("pairs: category '$from' does not exist") unless $catid{$from};
    for my $to (@{ $pairs->{byCategory}{$from} }) {
      bad("pairs: category $from suggests '$to', which is not a category") unless $catid{$to};
      bad("pairs: category $from suggests itself -- that is the aisle they are already in")
        if $to eq $from;
    }
  }
  ok(sprintf('%d product pairings over %d products, %d category rules',
             $named, scalar keys %{ $pairs->{byProduct} }, scalar keys %{ $pairs->{byCategory} }))
    unless $dangling || $self;

  # Every product must have a pairing of its own. Without one, a basket
  # holding just that product falls through to its category rule alone,
  # which offers the cheapest things from a neighbouring aisle --
  # technically a suggestion, visibly a shrug.
  my @noentry = grep { !$pairs->{byProduct}{$_} } sort keys %pid;
  if (@noentry) {
    my $show = join(', ', @noentry[0 .. ($#noentry > 7 ? 7 : $#noentry)]);
    $show .= ', ...' if $#noentry > 7;
    bad(sprintf('%d of %d products have no pairing of their own: %s',
                scalar @noentry, scalar keys %pid, $show));
  } else {
    ok(scalar(keys %pid) . ' products, every one with a pairing of its own');
  }

  # The other direction, which is a note and not a failure: a product
  # that nothing ever names can only be found by browsing. The category
  # layer may still surface it, so this is worth knowing rather than
  # worth blocking on.
  my %namedby;
  for my $from (keys %{ $pairs->{byProduct} }) {
    $namedby{$_}++ for @{ $pairs->{byProduct}{$from} };
  }
  my @orphan = grep { !$namedby{$_} } sort keys %pid;
  printf "  note  %d products nothing suggests, reachable only by browsing: %s\n",
    scalar @orphan, join(', ', @orphan) if @orphan;

  # A category with no rule suggests nothing for a basket made only of
  # it. Not a failure -- worth saying.
  my @bare = grep { !$pairs->{byCategory}{$_} } sort keys %catid;
  printf "  note  categories with no pairing rule: %s\n", join(', ', @bare) if @bare;
}

# --- pack shots -------------------------------------------------------
# Photographs are fetched by tools/getimages.pl from the Open Facts
# databases and SHIPPED in app/img, not hotlinked. Two ways that goes
# wrong quietly, and both put a hole where a product should be: an
# entry whose file was never written, and a file nothing points at.
my $IMGDIR = $D . '../img/';
my $imgs = eval { slurp('images.json') };
if (!$imgs) {
  print "  note  no images.json -- every product shows its drawn glyph\n";
} else {
  my ($missing, $shown) = (0, 0);
  for my $id (sort keys %{ $imgs->{images} }) {
    bad("images.json lists '$id', which is not a product"), next unless $pid{$id};
    if (!-s $IMGDIR . $id . '.jpg') {
      bad("$id has an images.json entry but no file at app/img/$id.jpg");
      $missing++;
    } else { $shown++ }
  }
  if (opendir(my $dh, $IMGDIR)) {
    my @orphan = sort grep { /\.jpg$/ && !$imgs->{images}{ substr($_, 0, -4) } } readdir $dh;
    closedir $dh;
    printf "  note  %d image files with no images.json entry: %s\n",
      scalar @orphan, join(', ', @orphan) if @orphan;
  }
  # The SAME photograph on two different products. It happens when two
  # rows of the catalogue are near-identical to a keyword search --
  # Bisleri 1L and 2L genuinely are one photograph, but Vim's dishwash
  # BAR and dishwash GEL are a bar and a bottle, and wearing the same
  # picture they are simply wrong. Compared by content, not by name,
  # because the filenames can never collide.
  my %seen;
  for my $id (sort keys %{ $imgs->{images} }) {
    my $file = $IMGDIR . $id . '.jpg';
    next unless -s $file;
    open my $fh, '<:raw', $file or next;
    local $/; my $bytes = <$fh>; close $fh;
    my $key = length($bytes) . ':' . unpack('%32C*', $bytes);
    push @{ $seen{$key} }, $id;
  }
  for my $k (sort keys %seen) {
    my @ids = @{ $seen{$k} };
    next if @ids < 2;
    printf "  note  one photograph shared by %s -- check it suits both\n",
      join(' and ', @ids);
  }

  ok(sprintf('%d pack shots, every one with a file; %d products on a drawn glyph',
             $shown, scalar(keys %pid) - $shown)) unless $missing;
}

  # Each category wears one of its own products as its picture. A hero
  # naming a product from a DIFFERENT aisle is the mistake that looks
  # deliberate -- a tin of ghee over "Soap & Personal Care" reads as a
  # shop that does not know its own shelves.
  for my $c (@{ $cats->{categories} }) {
    my $hero = $c->{hero} or next;
    if (!$pid{$hero}) { bad("category $c->{id} hero '$hero' is not a product"); next }
    bad("category $c->{id} hero '$hero' belongs to category '$bycat{$hero}'")
      if $bycat{$hero} ne $c->{id};
    print "  note  category $c->{id} hero '$hero' has no photograph, so the "
        . "app falls back to another product in that aisle\n"
      unless !$imgs || $imgs->{images}{$hero};
  }
  ok(scalar(@{ $cats->{categories} }) . ' category heroes, each from its own aisle');

print $fails ? "\n$fails FAILED\n" : "\nthe data holds together\n";
exit($fails ? 1 : 0);
