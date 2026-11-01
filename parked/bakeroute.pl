#!/usr/bin/perl
# Bake real road geometry into app/data/routes.json. ONE OFF.
#
#   perl tools/bakeroute.pl [simplified|full]
#
# This is an AUTHORING tool and must never become a runtime call. The
# route is fixed and does not vary per order, so computing it on every
# page load would be pure waste; the OSRM demo server is explicitly
# "restricted to reasonable, non-commercial use-cases" and this is a
# shop selling groceries; a customer on patchy 4G should not wait on a
# round trip to Germany to see a line; and OSRM's answer is a PLAUSIBLE
# route, not the tempo's actual one -- a baked array can be corrected
# by the shopkeeper, a computed one never can.
#
# It asks for one route per direction, a second apart, which is well
# inside the demo server's 1 request/second ceiling.
use strict;
use warnings;
use JSON::PP;

my $OVERVIEW = shift // 'simplified';
die "overview must be 'simplified' or 'full'\n" unless $OVERVIEW =~ /^(simplified|full)$/;

my $here = $0; $here =~ s{[^/]+$}{};
my $D = ($here || './') . '../app/data/';
my $jsonp = JSON::PP->new->canonical->pretty;

open my $rf, '<:raw', $D . 'routes.json' or die "routes.json: $!\n";
local $/;
my $routes = JSON::PP->new->decode(<$rf>);
close $rf;

my $tmp = ($ENV{TEMP} || '/tmp');
$tmp =~ s{\\}{/}g;

my %PATHS;
my $first = 1;
for my $r (@{ $routes->{routes} }) {
  unless ($first) { sleep 1 }          # stay under 1 request/second
  $first = 0;

  # OSRM wants lng,lat. Leaflet wants lat,lng. Getting this backwards
  # draws the route in the Indian Ocean off Somalia, so it is written
  # out explicitly in both directions rather than mapped in passing.
  my @wp = map { sprintf('%.6f,%.6f', $_->{ll}[1], $_->{ll}[0]) } @{ $r->{stops} };
  my $url = 'https://router.project-osrm.org/route/v1/driving/'
          . join(';', @wp)
          . '?overview=' . $OVERVIEW . '&geometries=geojson&annotations=false';

  my $out = "$tmp/osrm-$r->{id}.json";
  my $rc = system('curl', '-s', '-S', '--max-time', '45', '-o', $out, $url);
  die "curl failed for $r->{id}\n" if $rc != 0;

  open my $f, '<:raw', $out or die "$out: $!\n";
  my $ans = JSON::PP->new->decode(<$f>);
  close $f;

  unless (($ans->{code} // '') eq 'Ok') {
    die "OSRM said '" . ($ans->{code} // 'nothing') . "' for $r->{id}"
      . ($ans->{message} ? " -- $ans->{message}" : '') . "\n";
  }

  my $route = $ans->{routes}[0];
  my @coords = @{ $route->{geometry}{coordinates} };

  # [lng,lat] -> [lat,lng], rounded to 5 decimals (about a metre).
  my @path = map { [ 0 + sprintf('%.5f', $_->[1]), 0 + sprintf('%.5f', $_->[0]) ] } @coords;

  # Sanity: the baked line must stay inside the delivery area, or the
  # flip above is wrong and nothing downstream would notice.
  my ($latmin, $latmax, $lngmin, $lngmax) = (99, -99, 999, -999);
  for my $p (@path) {
    $latmin = $p->[0] if $p->[0] < $latmin; $latmax = $p->[0] if $p->[0] > $latmax;
    $lngmin = $p->[1] if $p->[1] < $lngmin; $lngmax = $p->[1] if $p->[1] > $lngmax;
  }
  die sprintf("%s: geometry spans %.3f..%.3f lat, %.3f..%.3f lng -- that is not Borivali, "
            . "check the lat/lng order\n", $r->{id}, $latmin, $latmax, $lngmin, $lngmax)
    unless $latmin > 19.0 && $latmax < 19.5 && $lngmin > 72.6 && $lngmax < 73.1;

  # The geometry goes to its OWN file. routes.json is fetched at boot
  # because every screen needs legSec to work out arrival windows, but
  # the shape of the road is only wanted on the three screens that draw
  # a map -- and at full fidelity it is 3x the size of everything else
  # in the app's data put together.
  $PATHS{ $r->{id} } = \@path;
  $r->{path} = undef;
  $r->{hasPath} = JSON::PP::true;

  # Real measured leg times replace the straight-line placeholder.
  my @legs = @{ $route->{legs} };
  for my $i (1 .. $#{ $r->{stops} }) {
    last if $i - 1 > $#legs;
    $r->{stops}[$i]{legSec} = int($legs[$i - 1]{duration} + 0.5);
  }
  $r->{stops}[0]{legSec} = 0;

  my $secs = 0; $secs += $_->{legSec} for @{ $r->{stops} };
  printf "%-10s %4d points  %5.2f km  %5.1f min free-flow  (%d legs)\n",
    $r->{id}, scalar @path, $route->{distance} / 1000, $secs / 60, scalar @legs;
}

$routes->{note} = 'Road geometry and leg times baked from router.project-osrm.org '
  . "(overview=$OVERVIEW, geometries=geojson) by tools/bakeroute.pl. This is an "
  . 'AUTHORING step, never a runtime call -- see CLAUDE.md. Coordinates are '
  . '[lat,lng] for Leaflet, flipped from the [lng,lat] GeoJSON returns. The stop '
  . 'ORDER is still hand-written and is the shopkeeper to confirm; OSRM only '
  . 'answers how to drive between the stops, not which stops to make.';

my @now = localtime;
$routes->{generated} = sprintf('%04d-%02d-%02d', $now[5] + 1900, $now[4] + 1, $now[3]);
$routes->{source} = "router.project-osrm.org overview=$OVERVIEW";

open my $of, '>:raw', $D . 'routes.json' or die "write routes.json: $!\n";
print $of $jsonp->encode($routes);
close $of;

open my $pf, '>:raw', $D . 'paths.json' or die "write paths.json: $!\n";
print $pf JSON::PP->new->canonical->encode({
  note => 'Road geometry only, fetched lazily by map.js when a map screen first '
        . 'opens. Split out of routes.json because every screen needs leg times to '
        . 'work out arrival windows, but only three draw a line. Coordinates are '
        . '[lat,lng] for Leaflet.',
  paths => \%PATHS,
});
close $pf;

printf "wrote app/data/routes.json (%.1f KB) + app/data/paths.json (%.1f KB)\n",
  (-s($D . 'routes.json')) / 1024, (-s($D . 'paths.json')) / 1024;
