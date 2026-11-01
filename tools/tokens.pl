#!/usr/bin/perl
# CSS token parity, and the rule that keeps it honest.
#
#   perl tools/tokens.pl
#
# Two things, both of which have bitten the sibling project:
#
#  1. Both palettes must define the SAME set. A token defined in only
#     one of them is how a theme ends up black on black -- and it will
#     look perfect in whichever mode you happened to be testing.
#  2. No component rule may name a colour. That rule is only real if
#     something checks it, so this flags every literal colour outside
#     the two :root blocks.
use strict;
use warnings;

my $here = $0; $here =~ s{[^/]+$}{};
my $file = ($here || './') . '../app/index.html';
open my $fh, '<:encoding(UTF-8)', $file or die "$file: $!\n";
local $/;
my $src = <$fh>;
close $fh;

# Only the <style> block -- the markup below it is not our problem here.
my ($css) = $src =~ m{<style>(.*?)</style>}s;
die "no <style> block found\n" unless $css;

# Strip comments FIRST. The comment above the palettes says "never
# hardcode #fff", and without this the literal-colour scan reports the
# warning against hardcoding colours as a hardcoded colour. A checker
# that cries wolf is worse than no checker.
$css =~ s{/\*.*?\*/}{}gs;

# Three :root blocks:
#   :root                              the light palette
#   :root:not([data-theme="light"])    dark, when the OS says so
#   :root[data-theme="dark"]           dark, when the host forces it
#
# The last two must exist and must be IDENTICAL. An artifact host can
# set data-theme itself, so a page with only the media query ignores
# the viewer's toggle -- and two dark palettes that have drifted apart
# give different colours depending on how dark was arrived at, which
# is the kind of bug nobody reproduces on purpose.
my %raw;
while ($css =~ /(:root[^{]*)\{([^}]*)\}/g) {
  my ($sel, $body) = ($1, $2);
  $sel =~ s/\s+//g;
  my $which = $sel eq ':root'                            ? 'light'
            : $sel eq ':root:not([data-theme="light"])'  ? 'dark'
            : $sel eq ':root[data-theme="dark"]'         ? 'darkforced'
            : undef;
  next unless $which;
  $raw{$which} = $body;
}
for my $need (qw(light dark darkforced)) {
  die "no :root block found for '$need'\n" unless defined $raw{$need};
}

my %def;
for my $which (keys %raw) {
  while ($raw{$which} =~ /(--[\w-]+)\s*:\s*([^;]+);/g) {
    my ($k, $v) = ($1, $2);
    $v =~ s/^\s+|\s+$//g;
    $def{$which}{$k} = $v;
  }
}

my $fails = 0;
sub bad { printf "  FAIL  %s\n", $_[0]; $fails++ }

# Spacing, radii, fonts and the header height are deliberately the same
# in both themes -- only a token carrying a COLOUR has to be redefined.
my $is_colour = sub { $_[0] =~ /#[0-9A-Fa-f]{3,8}\b|\brgba?\(|\bhsla?\(/ };

printf "  light defines %d tokens, dark redefines %d\n",
  scalar keys %{ $def{light} }, scalar keys %{ $def{dark} };

for my $t (sort keys %{ $def{light} }) {
  next if $def{dark}{$t};
  next unless $is_colour->($def{light}{$t});
  bad("$t carries a colour but is only defined in the light palette");
}
for my $t (sort keys %{ $def{dark} }) {
  bad("$t is defined in dark but NOT in light") unless exists $def{light}{$t};
}

# The two dark palettes must agree exactly.
{
  my %all = map { $_ => 1 } (keys %{ $def{dark} }, keys %{ $def{darkforced} });
  my $drift = 0;
  for my $t (sort keys %all) {
    my $a = $def{dark}{$t};
    my $b = $def{darkforced}{$t};
    if (!defined $a)      { bad("$t is in :root[data-theme=dark] but not the media query"); $drift++ }
    elsif (!defined $b)   { bad("$t is in the dark media query but not :root[data-theme=dark]"); $drift++ }
    elsif ($a ne $b)      { bad("$t differs between the two dark palettes: '$a' vs '$b'"); $drift++ }
  }
  print "  ok    both dark palettes are identical (", scalar keys %all, " tokens)\n" unless $drift;
}

# --- every var(--x) resolves ------------------------------------------
my %used;
$used{$1} = 1 while $css =~ /var\((--[\w-]+)/g;
for my $t (sort keys %used) {
  bad("var($t) is used but defined in neither palette")
    unless $def{light}{$t} || $def{dark}{$t};
}
printf "  %d distinct tokens referenced\n", scalar keys %used;

# A token nobody uses is dead weight, not a failure.
my @unused = grep { !$used{$_} } sort keys %{ $def{light} };
printf "  note  defined but never used: %s\n", join(' ', @unused) if @unused;

# --- no literal colours outside the palettes --------------------------
# Blank out the two :root blocks, then anything colour-shaped that is
# left is a component rule naming a colour.
my $rest = $css;
# Must match the SAME selectors as above -- `:root\s*\{` alone leaves
# :root:not(...) and :root[data-theme=...] in place, and then every
# token in the dark palettes is reported as a hardcoded colour.
$rest =~ s/:root[^{]*\{[^}]*\}//g;

my @lits;
while ($rest =~ /(#[0-9A-Fa-f]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\))/g) {
  my $lit = $1;
  # currentColor and transparent are not colours anyone has to theme.
  next if $lit =~ /^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/;
  push @lits, $lit;
}
if (@lits) {
  my %seen;
  for my $l (@lits) {
    next if $seen{$l}++;
    bad("literal colour '$l' outside the palettes -- give it a token");
  }
} else {
  print "  ok    no component rule names a colour\n";
}

print $fails ? "\n$fails FAILED\n" : "\nboth palettes agree\n";
exit($fails ? 1 : 0);
