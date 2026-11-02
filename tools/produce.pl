#!/usr/bin/perl
# Pack shots that getimages.pl could not match on its own -- the loose
# goods, which have no barcode, and the handful of packeted ones its
# scorer was not confident enough about.
#
#   perl tools/produce.pl fetch [ids]     loose goods, from Wikimedia Commons
#   perl tools/produce.pl shelf [ids]     packeted goods, from Open Facts
#   perl tools/produce.pl keep <id> <n>   install candidate n for that id
#   perl tools/produce.pl clean           throw the candidates away
#
# WHY THIS EXISTS SEPARATELY FROM getimages.pl
#
# getimages.pl matches a BARCODE against the Open Facts databases, and
# a loose onion has no barcode. It falls back to a keyword search over
# Wikimedia Commons, takes the first usable result, and has no way to
# tell a photograph of the product from a photograph of the subject.
# That is not a small distinction. It returned:
#
#   'potatoes heap'          -> a harvested field with a house in it
#   'banana bunch yellow'    -> File:Banana Bunch Top Virus.jpg, a plant
#                               pathology photo with the disease circled
#   'white sugar crystals'   -> an abstract macro of lit crystals
#   'green chili peppers'    -> a Brazilian market stall of RED ones
#   'kidney beans dried'     -> people pounding beans outdoors
#
# The terms that DID work -- 'red onion bulbs', 'garlic bulbs',
# 'lemons yellow fruit' -- name the object and nothing else. Every
# failure above carries a context word (heap, bunch, crystals) or a
# Latin name, and Commons answers context words with context.
#
# So this fetches SEVERAL candidates per product instead of one, with
# terms that name only the object, and leaves the choosing to a person
# looking at them. No scoring function knows the difference between a
# good photograph of an onion and a good photograph of a farm.
use strict;
use warnings;
use JSON::PP;

my $UA   = 'kirana-shop/1.0 (local, one-off; contact via the repo)';
my $here = $0; $here =~ s{[^/]+$}{};
my $APP  = ($here || './') . '../app/';
my $CAND = $APP . '_cand/';
my $IMG  = $APP . 'img/';

# Object, and nothing but the object. `-drawing -diagram -map` keeps
# out the botanical plates that a bare noun returns on Commons.
my %TERMS = (
  'p-potato1'     => 'potatoes white background -drawing -diagram -field',
  'p-tomato1'     => 'tomatoes white background -drawing -diagram',
  'p-banana12'    => 'bananas white background -drawing -diagram -virus -disease',
  'p-chilli250'   => 'green chilli peppers white background -drawing -market',
  'p-sugar1'      => 'sugar bowl white background -drawing -macro',
  'p-rajma500'    => 'dried kidney beans seeds -cooked -dish -rice -plate',
  'p-curryleaf1'  => 'curry leaves kadi patta leaves',
  'p-candles6'    => 'white candles white background -drawing -flame',
  'p-matchbox10'  => 'safety matches box -drawing -label -collection',
  'p-ginger250'   => 'ginger root white background -drawing -plant',
  'p-coriander1'  => 'coriander leaves bunch -plant -field -drawing',
  'p-kajukatli250' => 'kaju katli barfi indian sweet -drawing',
  'p-dryfruit400' => 'mixed nuts dried fruit -tree -plant'
);

# PACKETED goods that getimages.pl left on a glyph. It scores a search
# result and rejects anything it is not confident about, which is the
# right default for a run over 115 products and the wrong one for the
# handful left over -- a probe of these eleven found good Indian rows
# sitting under all of them:
#
#   Thums Up     8901764042911, brand recorded as "Thums up"
#   Limca        8901764052538
#   Lizol        8901396144137
#   Vim          8901030889875, "Vim liquid gel"
#   Good Knight  8901023023002, a Flash Vaporiser rather than our
#                Activ+ refill -- a different VARIANT of the right
#                brand, which the shelf carries too
#
# and genuinely nothing under the others. Colin returns a video game
# (Colin McRae Dirt 2), Exo a French schoolbook, and Origami nothing
# whatever. Those stay drawn.
my %SHELF = (
  'p-thumsup750'   => ['world.openfoodfacts.org',     'Thums Up'],
  'p-coke750'      => ['world.openfoodfacts.org',     'Coca Cola India'],
  'p-limca750'     => ['world.openfoodfacts.org',     'Limca'],
  'p-chaimasala50' => ['world.openfoodfacts.org',     'Tata Sampann'],
  'p-vimgel750'    => ['world.openproductsfacts.org', 'Vim liquid gel'],
  'p-lizol975'     => ['world.openproductsfacts.org', 'Lizol'],
  'p-goodknight45' => ['world.openproductsfacts.org', 'Good Knight'],
  'p-colin500'     => ['world.openproductsfacts.org', 'Colin glass cleaner'],
  'p-exo700'       => ['world.openproductsfacts.org', 'Exo dishwash'],
  'p-soanpapdi500' => ['world.openfoodfacts.org',     'soan papdi'],
);

sub esc_q { my $s = shift; $s =~ s/([^A-Za-z0-9_.~-])/sprintf('%%%02X', ord $1)/ge; $s }

# Four tries, and anything that is not JSON does not count as an
# answer: a busy moment at these APIs returns an HTML holding page,
# not a status code, and one attempt reads that as "no such thing".
sub get {
  my ($url) = @_;
  for my $try (1 .. 4) {
    open my $p, '-|', 'curl', '-s', '--max-time', '25', '-A', $UA, $url or next;
    local $/; my $body = <$p>; close $p;
    return $body if ($body // '') =~ /^\s*\{/;
    sleep $try;
  }
  return undef;
}

sub fetch_all {
  my @only = @_;
  my %want = map { $_ => 1 } @only;
  for my $id (@only){ die "$id is not a loose good in %TERMS\n" unless $TERMS{$id} }
  mkdir $CAND unless -d $CAND;
  # Only the ids asked for, so re-trying one product leaves the
  # other candidates where they are.
  unlink(@only ? (map { glob($CAND . $_ . '__*.jpg') } @only) : glob($CAND . '*'));

  my %found;
  if (@only && -s $CAND . 'index.json'){
    open my $f, '<:raw', $CAND . 'index.json' or die;
    %found = %{ JSON::PP->new->utf8->decode(do { local $/; <$f> }) }; close $f;
    delete $found{$_} for @only;
  }
  for my $id (sort keys %TERMS) {
    next if @only && !$want{$id};
    my $term = $TERMS{$id};
    my $url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json'
      . '&generator=search&gsrnamespace=6&gsrlimit=10&gsrsearch=' . esc_q($term)
      . '&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=500';
    my $body = get($url);
    my $j = $body ? eval { JSON::PP->new->utf8->decode($body) } : undef;
    unless ($j && $j->{query} && $j->{query}{pages}) {
      printf "  %-16s nothing came back\n", $id;
      next;
    }
    my @pages = sort { ($a->{index} // 99) <=> ($b->{index} // 99) }
                values %{ $j->{query}{pages} };
    my $n = 0;
    for my $p (@pages) {
      last if $n >= 6;
      my $ii = $p->{imageinfo} && $p->{imageinfo}[0] or next;
      next unless ($ii->{mime} // '') =~ m{^image/(jpeg|png)$};
      next unless ($ii->{thumburl} // '') =~ /^https/;
      next if ($ii->{width} // 0) < 400;
      $n++;
      my $out = sprintf '%s%s__%d.jpg', $CAND, $id, $n;
      my $rc = system('curl', '-s', '-f', '-o', $out, '--max-time', '30',
                      '-A', $UA, $ii->{thumburl});
      if ($rc != 0 || !-s $out) { unlink $out; $n--; next; }
      # Every file here is named <id>.jpg, because that is what the
      # app asks for, and serve.pl types a response from the
      # extension -- so a PNG written here goes out as image/jpeg
      # carrying PNG bytes. Browsers sniff and render it anyway,
      # which is precisely why nobody would ever notice. A PNG
      # thumbnail of a photograph is also several times the size:
      # the one this caught was 165 KB against 18 KB for the same
      # tile as a JPEG.
      open my $chk, '<:raw', $out or die;
      read $chk, my $magic, 3; close $chk;
      if ($magic ne "\xff\xd8\xff") { unlink $out; $n--; next; }
      push @{ $found{$id} }, {
        n => $n,
        source => 'commons.wikimedia.org',
        title => ($p->{title} // ''),
        page  => ($ii->{descriptionurl} // ''),
      };
    }
    printf "  %-16s %d candidates  (%s)\n", $id, $n, $term;
  }

  open my $o, '>:raw', $CAND . 'index.json' or die "index: $!\n";
  print $o JSON::PP->new->utf8->pretty->canonical->encode(\%found); close $o;
  print "\ncandidates in app/_cand/ -- look at them, then:\n";
  print "  perl tools/produce.pl keep <id> <n>\n";
}

# Download one candidate and record it, or say why it did not count.
# Shared by both fetchers so the PNG guard cannot be in one and not
# the other -- which is exactly how a guard stops being a guard.
sub stage {
  my ($id, $n, $url, $meta) = @_;
  my $out = sprintf '%s%s__%d.jpg', $CAND, $id, $n;
  my $rc = system('curl', '-s', '-f', '-o', $out, '--max-time', '30', '-A', $UA, $url);
  if ($rc != 0 || !-s $out) { unlink $out; return 0 }
  open my $chk, '<:raw', $out or die;
  read $chk, my $magic, 3; close $chk;
  if ($magic ne "\xff\xd8\xff") { unlink $out; return 0 }
  $meta->{n} = $n;
  return 1;
}

# The same "several candidates, a person chooses" shape as fetch_all,
# pointed at the Open Facts databases instead of Commons.
sub shelf_fetch {
  my @only = @_;
  my %want = map { $_ => 1 } @only;
  for my $id (@only){ die "$id is not in %SHELF\n" unless $SHELF{$id} }
  mkdir $CAND unless -d $CAND;
  unlink(map { glob($CAND . $_ . '__*.jpg') } (@only ? @only : keys %SHELF));

  my %found;
  if (-s $CAND . 'index.json'){
    open my $f, '<:raw', $CAND . 'index.json' or die;
    %found = %{ JSON::PP->new->utf8->decode(do { local $/; <$f> }) }; close $f;
    delete $found{$_} for (@only ? @only : keys %SHELF);
  }

  for my $id (sort keys %SHELF) {
    next if @only && !$want{$id};
    my ($host, $q) = @{ $SHELF{$id} };
    my $url = "https://$host/cgi/search.pl?search_terms=" . esc_q($q)
      . '&search_simple=1&action=process&json=1&page_size=10'
      . '&fields=code,product_name,brands,image_front_small_url';
    my $body = get($url);
    my $r = $body ? eval { JSON::PP->new->utf8->decode($body) } : undef;
    unless ($r && $r->{products}) { printf "  %-16s nothing came back\n", $id; next }

    my $n = 0;
    for my $p (@{ $r->{products} }) {
      last if $n >= 6;
      my $src = $p->{image_front_small_url} // '';
      next unless $src =~ /^https/;
      (my $big = $src) =~ s/\.200\.jpg$/.400.jpg/;   # same image, one size up
      my $meta = {
        source  => $host,
        title   => ($p->{product_name} // '(no name)'),
        code    => ($p->{code} // ''),
        page    => "https://$host/product/" . ($p->{code} // ''),
      };
      $n++;
      unless (stage($id, $n, $big, $meta) || stage($id, $n, $src, $meta)) { $n--; next }
      push @{ $found{$id} }, $meta;
    }
    printf "  %-16s %d candidates  (%s on %s)\n", $id, $n, $q, $host;
  }

  open my $o, '>:raw', $CAND . 'index.json' or die "index: $!\n";
  print $o JSON::PP->new->utf8->pretty->canonical->encode(\%found); close $o;
  print "\ncandidates in app/_cand/ -- look at them, then:\n";
  print "  perl tools/produce.pl keep <id> <n>\n";
}

sub keep {
  my ($id, $n) = @_;
  die "which product, and which candidate?\n" unless $id && defined $n;
  my $src = sprintf '%s%s__%d.jpg', $CAND, $id, $n;
  die "$src is not there -- run `fetch` first\n" unless -s $src;

  open my $f, '<:raw', $CAND . 'index.json' or die "index: $!\n";
  my $idx = JSON::PP->new->utf8->decode(do { local $/; <$f> }); close $f;
  my ($meta) = grep { $_->{n} == $n } @{ $idx->{$id} || [] };
  die "no record of candidate $n for $id\n" unless $meta;

  open my $i, '<:raw', $src or die; my $bytes = do { local $/; <$i> }; close $i;
  open my $o, '>:raw', $IMG . $id . '.jpg' or die; print $o $bytes; close $o;

  my $pf = $APP . 'data/images.json';
  open my $p, '<:raw', $pf or die "$pf: $!\n";
  my $prov = JSON::PP->new->utf8->decode(do { local $/; <$p> }); close $p;
  # Whichever database this candidate actually came from. Writing
  # Commons here regardless would put the wrong credit in the file
  # that Settings reads its attribution out of.
  $prov->{images}{$id} = {
    source  => ($meta->{source} // 'commons.wikimedia.org'),
    matched => $meta->{title},
    page    => $meta->{page},
    ($meta->{code} ? (code => $meta->{code}) : ()),
    bytes   => length($bytes),
  };
  open my $q, '>:raw', $pf or die; print $q JSON::PP->new->utf8->pretty->canonical->encode($prov); close $q;

  printf "%s <- candidate %d (%s), %d bytes\n", $id, $n, $meta->{title}, length($bytes);
}

my $cmd = shift // '';
if    ($cmd eq 'fetch') { fetch_all(@ARGV) }
elsif ($cmd eq 'shelf') { shelf_fetch(@ARGV) }
elsif ($cmd eq 'keep')  { keep(@ARGV) }
elsif ($cmd eq 'clean') { unlink glob($CAND . '*'); rmdir $CAND; print "candidates gone\n" }
else { print "usage: produce.pl fetch [ids] | shelf [ids] | keep <id> <n> | clean\n"; exit 1 }
