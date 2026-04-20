import { OpportunityCard as OpportunityCardType } from "@/lib/types";

interface Props {
  card: OpportunityCardType;
  rank?: number; // 1-based display rank
}

export default function OpportunityCard({ card, rank }: Props) {
  return (
    <div className="rounded-xl border border-red-100/90 bg-white p-4 shadow-sm transition-all duration-200 hover:border-red-200 hover:shadow-md">
      <div className="flex items-start gap-3">
        {/* Rank badge */}
        {rank && (
          <span className="flex-shrink-0 w-7 h-7 rounded-full bg-red-100 text-red-700 text-xs font-bold
                           flex items-center justify-center mt-0.5">
            {rank}
          </span>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 text-sm">{card.suburb_name}</h3>
            {card.monthly_volume > 0 && (
              <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-2 py-0.5 flex-shrink-0">
                {card.monthly_volume.toLocaleString()} searches/mo
              </span>
            )}
          </div>

          <p className="text-sm text-gray-600 mt-1 leading-relaxed">{card.card_text}</p>

          {/* Visual rank indicator */}
          <div className="mt-2 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400 flex-shrink-0" />
            <span className="text-xs text-red-600 font-medium">Not ranking</span>
          </div>
        </div>
      </div>
    </div>
  );
}
