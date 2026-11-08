#!/usr/bin/perl
# Fetch real pack shots for the catalogue.
#
#   perl tools/getimages.pl            # everything that has no image yet
#   perl tools/getimages.pl p-lays52   # just these ids, re-fetching
#
# WHERE THESE COME FROM, and why not Google.
#
# Google Images is a search index, not a source: it serves no stable
# embeddable URL, and every brand pack shot on it belongs to the brand.
# Hotlinking a grocery app's CDN is worse -- bigbasket and grofers both
# answer 403 from here anyway, and an image that 403s in the shop is a
# broken tile in front of a customer.
#
# These come instead from the three Open Facts databases, which are
# crowd-photographed and openly licensed (images CC-BY-SA, data ODbL):
#
#   openfoodfacts.org     food, drink, tea, dairy, staples, masala
#   openbeautyfacts.org   soap, shampoo, toothpaste
#   openproductsfacts.org detergent, cleaning, household
#
# They are REAL photographs of the real packets, which is the whole
# point, and they can be shipped inside the app rather than fetched
# over a shop's patchy 4G.
#
# A WRONG pack shot is worse than no pack shot -- "Amul Butter" over a
# tub of Danish spread reads as a careless shop. So every candidate is
# scored and anything weak is REJECTED, leaving that product on its
# drawn glyph. Rejections are printed; they are a result, not a failure.
use strict;
use warnings;
use JSON::PP;

# The repo root, found from where this script lives -- a path typed in
# here only ever worked on one laptop.
use FindBin;
my $root = "$FindBin::Bin/../";
my $IMG  = $root . 'app/img/';
mkdir $IMG unless -d $IMG;

# Open Food Facts asks that clients identify themselves.
my $UA = 'MilansSuperShoppe/1.0 (kirana demo; contact via shop)';

my %DB = (
  staples => 'world.openfoodfacts.org',
  snacks  => 'world.openfoodfacts.org',
  drinks  => 'world.openfoodfacts.org',
  dairy   => 'world.openfoodfacts.org',
  tea     => 'world.openfoodfacts.org',
  masala  => 'world.openfoodfacts.org',
  fresh   => 'world.openfoodfacts.org',
  care    => 'world.openbeautyfacts.org',
  clean   => 'world.openproductsfacts.org',
  baby    => 'world.openproductsfacts.org',
);

# Loose goods have no packet and no barcode, so no barcode database
# holds a picture of them. A plain photograph of the vegetable is what
# a customer expects anyway -- nobody wants a branded onion -- and
# Wikimedia Commons is full of well-lit, openly licensed ones.
#
# These search terms are hand-written because Commons rewards precision
# and punishes vagueness: "onion" alone returns botanical plates and
# field photographs, "red onion bulb" returns onions on a table.
my %COMMONS = (
  'p-onion1'      => 'red onion bulbs',
  'p-potato1'     => 'potatoes heap',
  'p-tomato1'     => 'tomatoes red ripe',
  'p-banana12'    => 'banana bunch yellow',
  'p-lemon250'    => 'lemons yellow fruit',
  'p-ginger250'   => 'ginger rhizome root',
  'p-garlic250'   => 'garlic bulbs',
  'p-chilli250'   => 'green chili peppers',
  'p-coriander1'  => 'coriander leaves cilantro bunch',
  'p-curryleaf1'  => 'curry leaves murraya koenigii',
  'p-sugar1'      => 'white sugar crystals',
  'p-poha500'     => 'poha flattened rice',
  'p-rajma500'    => 'kidney beans dried',
  'p-rice-kolam5' => 'white rice grains uncooked',
  'p-candles6'    => 'white candles',
  'p-matchbox10'  => 'matchbox matches',
);

# Words that say nothing about WHICH product this is. Matching on these
# is how you end up with a bag of someone else's rice.
my %STOP = map { $_ => 1 } qw(shop pack of original classic premium rich
  fresh pure natural care gold plus advanced complete total easy the and
  with for one two three ml kg pc pcs pkt litre liter gm gms g l);

sub slurp {
  open my $f, '<:raw', $root . 'app/data/' . $_[0] or die "$_[0]: $!\n";
  local $/; my $j = JSON::PP->new->decode(<$f>); close $f; return $j;
}

# Open Food Facts answers a busy moment with an HTML "page temporarily
# unavailable" rather than a status code, so a single attempt reads as
# "this product does not exist" when it means "ask again in a second".
# That cost a perfectly good Lay's pack shot on the first run.
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

# Wikimedia Commons, for the loose goods. `gsrnamespace=6` is the File
# namespace and `iiurlwidth` makes the server do the resizing, so what
# comes back is a 400px thumbnail and not a 12-megapixel original.
sub commons {
  my ($term, $out) = @_;
  my $url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json'
    . '&generator=search&gsrnamespace=6&gsrlimit=8&gsrsearch=' . esc_q($term)
    . '&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=400';
  my $body = get($url);
  my $j = $body ? eval { JSON::PP->new->decode($body) } : undef;
  return undef unless $j && $j->{query} && $j->{query}{pages};

  # Commons search is ordered by relevance, so the first USABLE result
  # is the one to take. Usable means a real photograph: svg diagrams
  # and botanical line drawings are the common wrong answer here, and
  # a drawing of an onion is exactly what this change is replacing.
  my @pages = sort { ($a->{index} // 99) <=> ($b->{index} // 99) }
              values %{ $j->{query}{pages} };
  for my $p (@pages) {
    my $ii = $p->{imageinfo} && $p->{imageinfo}[0] or next;
    next unless ($ii->{mime} // '') =~ m{^image/(jpeg|png)$};
    next unless ($ii->{thumburl} // '') =~ /^https/;
    next if ($ii->{width} // 0) < 400;          # too small to have been a photo
    my $rc = system('curl', '-s', '-f', '-o', $out, '--max-time', '30',
                    '-A', $UA, $ii->{thumburl});
    next if $rc != 0 || !-s $out;
    return { title => ($p->{title} // ''), descriptionurl => ($ii->{descriptionurl} // '') };
  }
  return undef;
}

sub tokens {
  my ($s) = @_;
  $s = lc($s // '');
  $s =~ s/[^a-z0-9]+/ /g;
  return grep { length($_) > 1 && !$STOP{$_} } split ' ', $s;
}

my $cat = slurp('catalog.json');
my @want = @ARGV;
my %only = map { $_ => 1 } @want;

# Provenance is kept because these are other people's photographs under
# a share-alike licence: the app has to be able to say where each one
# came from, and a year from now nobody will remember.
my $provfile = $root . 'app/data/images.json';
my $prov = -e $provfile
  ? do { open my $f, '<:raw', $provfile; local $/; my $j = JSON::PP->new->decode(<$f>); close $f; $j }
  : { note => '', images => {} };
$prov->{note} = 'Pack shots from the Open Facts databases (openfoodfacts.org, '
  . 'openbeautyfacts.org, openproductsfacts.org). Photographs are CC-BY-SA, '
  . 'the data ODbL. Regenerate with tools/getimages.pl. Each entry records '
  . 'the barcode it came from so a wrong match can be traced and replaced.';

my ($got, $kept, $rejected, $failed) = (0, 0, 0, 0);
my @bad;

for my $p (@{ $cat->{products} }) {
  my $id = $p->{id};
  next if @want && !$only{$id};
  if (!@want && -s $IMG . $id . '.jpg') { $kept++; next }

  my $host = $DB{ $p->{cat} } or next;
  my $brand = $p->{brand} // '';
  my $name  = $p->{name}{en};

  # "Shop" products are loose goods with no packet and no barcode --
  # onion, poha, sugar, eggs. Nothing in a barcode database is a
  # photograph of this shop's own sack, so these go to Wikimedia
  # Commons instead, where a plain photograph of the vegetable is
  # exactly right and is what a customer expects to see anyway.
  if ($brand eq '' || lc($brand) eq 'shop') {
    my $term = $COMMONS{$id};
    if (!$term) {
      push @bad, "$id  (loose goods, no search term in %COMMONS)";
      # A rejection must also FORGET any entry from an earlier run, or
      # images.json keeps pointing at a file this run just refused to
      # write -- which data.pl correctly treats as a broken install.
      delete $prov->{images}{$id};
      $rejected++;
      next;
    }
    my $hit = commons($term, $IMG . $id . '.jpg');
    if (!$hit) {
      push @bad, sprintf('%-20s Commons had nothing usable for "%s"', $id, $term);
      # A rejection must also FORGET any entry from an earlier run, or
      # images.json keeps pointing at a file this run just refused to
      # write -- which data.pl correctly treats as a broken install.
      delete $prov->{images}{$id};
      $rejected++;
      next;
    }
    $prov->{images}{$id} = {
      matched => $hit->{title}, source => 'commons.wikimedia.org',
      page    => $hit->{descriptionurl}, bytes => -s $IMG . $id . '.jpg',
    };
    $got++;
    printf "  %-20s %-44s  commons\n", $id, substr($hit->{title}, 0, 44);
    next;
  }

  my @bt = tokens($brand);
  my @nt = tokens($name);

  # Three queries, narrowest first. The full phrase is the best match
  # when it hits, but these are keyword searches over a sparse index:
  # the beauty and household databases have thin Indian coverage, and
  # "Surf Excel Easy Wash Detergent Powder" returns NOTHING there while
  # "Surf Excel" returns fourteen rows. Searching only the long phrase
  # is what left the whole cleaning aisle on glyphs the first time.
  # Scoring is unchanged and still decides, so a looser QUERY never
  # means a looser MATCH -- it only means the right row gets seen.
  my @queries = ("$brand $name");
  $queries[0] =~ s/,.*$//;            # "pack of 4" only narrows wrongly
  push @queries, "$brand $nt[0]" if @nt;
  push @queries, $brand;
  my (%tried, @q);
  for my $x (@queries) { push @q, $x unless $tried{lc $x}++ }

  my ($best, $bestscore, $why) = (undef, 0, '');
  my $searched = 0;
  my %cand;                            # barcode => {row, score, why}

  for my $q (@q) {
    my $url = "https://$host/cgi/search.pl?search_terms=" . esc_q($q)
      . '&search_simple=1&action=process&json=1&page_size=10'
      . '&fields=code,product_name,brands,image_front_small_url,countries_tags';
    my $body = get($url);
    my $j = $body ? eval { JSON::PP->new->decode($body) } : undef;
    next unless $j && $j->{products};
    $searched++;

    for my $r (@{ $j->{products} }) {
      next unless ($r->{image_front_small_url} // '') =~ /^https/;
      my $hay = lc(($r->{brands} // '') . ' ' . ($r->{product_name} // ''));

      # The brand must actually be there. This is the check that stops a
      # search for "Amul Butter" settling on anybody's butter.
      my $bhit = 0;
      for my $b (@bt) { $bhit++ if index($hay, $b) >= 0 }
      next unless $bhit == scalar @bt;

      my $nhit = 0;
      for my $n (@nt) { $nhit++ if index($hay, $n) >= 0 }
      next unless $nhit;

      my $score = $bhit * 3 + $nhit * 2;
      # An Indian entry is far more likely to be the pack actually on
      # the shelf in Borivali than the brand's export version.
      $score += 4 if grep { $_ eq 'en:india' } @{ $r->{countries_tags} || [] };

      next if $cand{ $r->{code} // '' };
      $cand{ $r->{code} // '' } = {
        row => $r, score => $score,
        why => "brand $bhit/" . scalar(@bt) . ", name $nhit/" . scalar(@nt),
      };
      if ($score > $bestscore) { $bestscore = $score; $best = $r }
    }
    last if $bestscore >= 9;           # already a strong hit; stop asking
  }

  if (!$searched) { $failed++; push @bad, "$id  (search failed)"; next }

  # Threshold 5 = every brand word present, plus at least one word of
  # the product name. That deliberately accepts a different VARIANT of
  # the right brand -- Colgate Triple Action standing in for Colgate
  # Strong Teeth -- because a customer reads that as "Colgate" and the
  # shelf has both anyway. What it will not accept is a different
  # brand, which is the mismatch that makes a shop look careless.
  if (!$best || $bestscore < 5) {
    push @bad, sprintf('%-20s no confident match for "%s" (%d quer%s tried)',
                       $id, $q[0], scalar @q, @q == 1 ? 'y' : 'ies');
    # A rejection must also FORGET any entry from an earlier run, or
    # images.json keeps pointing at a file this run just refused to
    # write -- which data.pl correctly treats as a broken install.
    delete $prov->{images}{$id};
    $rejected++;
    next;
  }

  # Best score first, and download until one is actually a PHOTOGRAPH.
  #
  # The scoring only knows what the row is CALLED. It cannot see that
  # the picture attached to it is someone's hand holding the barcode
  # edge of a Vim bar in a dim shop -- which is a real entry, correctly
  # named, and useless. At 400px a genuine pack shot does not compress
  # below about 12 KB; the ones that do are blurred snapshots, extreme
  # crops, or near-blank. So the floor is a crude proxy for "is this a
  # picture of the product" and it is the only one available without
  # decoding JPEG, which this machine has no library for.
  my $out = $IMG . $id . '.jpg';
  my @ranked = sort { $b->{score} <=> $a->{score} } values %cand;
  my ($took, $skipped) = (undef, 0);

  for my $c (@ranked) {
    my $src = $c->{row}{image_front_small_url};
    (my $big = $src) =~ s/\.200\.jpg$/.400.jpg/;   # same image, one size up
    my $rc = system('curl', '-s', '-f', '-o', $out, '--max-time', '30', '-A', $UA, $big);
    $rc = system('curl', '-s', '-f', '-o', $out, '--max-time', '30', '-A', $UA, $src)
      if $rc != 0 || !-s $out;
    next if $rc != 0 || !-s $out;

    if (-s $out < 12_000) { $skipped++; unlink $out; next }
    $took = $c;
    last;
  }

  if (!$took) {
    unlink $out if -e $out;
    push @bad, sprintf('%-20s %d candidate%s, none a usable photograph',
                       $id, scalar @ranked, @ranked == 1 ? '' : 's');
    # A rejection must also FORGET any entry from an earlier run, or
    # images.json keeps pointing at a file this run just refused to
    # write -- which data.pl correctly treats as a broken install.
    delete $prov->{images}{$id};
    $rejected++;
    next;
  }

  $prov->{images}{$id} = {
    code    => $took->{row}{code},
    matched => $took->{row}{product_name},
    brands  => $took->{row}{brands},
    source  => $host,
    bytes   => -s $out,
  };
  $got++;
  printf "  %-20s %-44s  %s%s\n", $id,
    substr($took->{row}{product_name} // '', 0, 44), $took->{why},
    $skipped ? ", $skipped too small" : '';
}

sub esc_q { my $s = shift; $s =~ s/([^A-Za-z0-9\-_.])/sprintf('%%%02X', ord($1))/ge; return $s }

open my $o, '>:raw', $provfile or die $!;
print $o JSON::PP->new->pretty->canonical->encode($prov);
close $o;

print "\n";
printf "  %d fetched, %d already had one, %d without a pack shot, %d failed\n",
  $got, $kept, $rejected, $failed;
print "\n  No pack shot (these keep their drawn glyph):\n" if @bad;
print "    $_\n" for @bad;
printf "\n  %d of %d products now have a photograph\n",
  scalar(keys %{ $prov->{images} }), scalar @{ $cat->{products} };
